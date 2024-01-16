use async_trait::async_trait;
use bytes::Bytes;
pub use functions::filter_labels;
use http_body_util::{BodyExt, Full};
use hyper::{Method, Request, Response, Uri};
use reqwest::header::{HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::path::PathBuf;
use std::sync::Arc;
use structopt::StructOpt;
use tracing::{debug, error};

pub mod functions;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

pub async fn parse_route<T>(
    req: Request<T>,
    opts: Arc<Options>,
    labeler: Arc<impl LabelerHandler>,
) -> std::result::Result<Response<Full<Bytes>>, Infallible>
where
    T: hyper::body::Body + Sync + Send + 'static + std::fmt::Debug,
    <T as hyper::body::Body>::Error: std::fmt::Debug + std::fmt::Display,
    <T as hyper::body::Body>::Data: Send + Sync + 'static,
{
    // Strip the trailing slash if it exists such that e.g. '/labeler/' and
    // '/labeler' are treated the same.
    match req
        .uri()
        .path()
        .strip_suffix('/')
        .unwrap_or(req.uri().path())
    {
        "/labeler" => {
            if req.method() != Method::POST {
                error!("unsupported http method: {}", req.method());

                let resp = Response::builder()
                    .status(405)
                    .body(Full::new(Bytes::from("")))
                    .unwrap();
                return Ok(resp);
            }
            if verify_headers(&req).is_err() {
                error!("invalid headers: {:?}", req.headers());

                let resp = Response::builder()
                    .status(401)
                    .body(Full::new(Bytes::from("")))
                    .unwrap();
                return Ok(resp);
            }
            let req_ext = Box::new(RequestExtImpl {});
            if let Err(err) = labeler.gitlab_handle(req, opts, req_ext).await {
                error!("failed to parse webhook: {err}");
            }
        }
        _ => {
            error!("unknown route {}", req.uri().path());

            let resp = Response::builder()
                .status(404)
                .body(Full::new(Bytes::from("")))
                .unwrap();
            return Ok(resp);
        }
    }

    Ok(Response::new(Full::new(Bytes::from(""))))
}

fn verify_headers<T>(req: &Request<T>) -> Result<()> {
    let headers = req.headers();
    let event = headers
        .get("X-Gitlab-Event")
        .ok_or("Missing X-Gitlab-Event header")?;

    if event != "Merge Request Hook" {
        return Err(format!("Invalid event: {:?}", event).into());
    }

    Ok(())
}

// Convenience trait abstracting away IO for testing
#[async_trait]
pub trait LabelerHandler: Sync + Send {
    async fn gitlab_handle<T>(
        &self,
        req: Request<T>,
        opts: Arc<Options>,
        req_ext: Box<dyn RequestExt>,
    ) -> Result<()>
    where
        T: hyper::body::Body + Sync + Send + 'static + std::fmt::Debug,
        <T as hyper::body::Body>::Error: std::fmt::Debug + std::fmt::Display,
        <T as hyper::body::Body>::Data: Send + Sync + 'static;
}

pub struct Labeler;

#[async_trait]
impl LabelerHandler for Labeler {
    async fn gitlab_handle<T>(
        &self,
        req: Request<T>,
        opts: Arc<Options>,
        req_ext: Box<dyn RequestExt>,
    ) -> Result<()>
    where
        T: hyper::body::Body + Send + Sync + 'static,
        <T as hyper::body::Body>::Error: std::fmt::Debug + std::fmt::Display,
        <T as hyper::body::Body>::Data: Send + Sync + 'static,
    {
        let data = req
            .into_body()
            .boxed()
            .collect()
            .await
            .map_err(|e| format!("Failed to parse incoming request body: {e}"))?
            .to_bytes();

        let resp_hook: Webhook = serde_json::from_slice(&data)
            .map_err(|e| format!("Failed to  deserialize webhook: {e}"))?;

        if !verify_action(&resp_hook.object_attributes) {
            return Ok(());
        }

        match resp_hook.event_type.as_str() {
            "merge_request" => {
                let url = format!(
                    "{}/projects/{}/merge_requests/{}/changes",
                    opts.gitlab_uri, resp_hook.project.id, resp_hook.object_attributes.iid
                );

                if opts.gitlab_token.is_empty() {
                    error!("No GitLab token provided, skipping labeler");
                    return Ok(());
                }

                let resp = req_ext
                    .do_request(&url, Method::GET, Some(&opts.gitlab_token), None)
                    .await
                    .map_err(|e| format!("Failed to get changes: {e}"))?
                    .bytes()
                    .await?;

                let resp_changes = serde_json::from_slice::<Changes>(&resp)
                    .map_err(|e| format!("Failed to deserialize changes: {e}"))?;

                let config_url = format!(
                    "{}/projects/{}/repository/files/LABELS/raw?ref={}",
                    opts.gitlab_uri, resp_hook.project.id, opts.config_branch
                );

                let config_resp = req_ext
                    .do_request(&config_url, Method::GET, Some(&opts.gitlab_token), None)
                    .await
                    .map_err(|e| format!("Failed to get config: {e}"))?
                    .text()
                    .await
                    .map_err(|e| format!("Failed to deserialize config: {e}"))?;

                let config: Config = toml::from_str(&config_resp).map_err(|e| {
                    format!("Failed to deserialize config from toml: {e}\n{config_resp}",)
                })?;
                let labels = filter_labels(config, resp_changes).collect::<Vec<_>>();

                let data = serde_json::to_vec(&Labels {
                    labels: labels.clone(),
                })?;

                let label_url = format!(
                    "{}/projects/{}/merge_requests/{}",
                    opts.gitlab_uri, resp_hook.project.id, resp_hook.object_attributes.iid
                );

                debug!("labels to be applied: {:#?} to {label_url}", &labels);

                req_ext
                    .do_request(
                        &label_url,
                        Method::PUT,
                        Some(&opts.gitlab_token),
                        Some(data.as_slice()),
                    )
                    .await
                    .map_err(|e| {
                        error!("Failed to apply labels: {e}");
                        e
                    })?;
                Ok(())
            }
            _ => {
                error!("Unknown event type: {}", resp_hook.event_type);
                Ok(())
            }
        }
    }
}

fn verify_action(attr: &ObjectAttributes) -> bool {
    match attr.action {
        Some(ref action) if action == "open" || action == "reopen" => true,
        Some(_) => {
            debug!("Ignoring non open merge request hook");
            false
        }
        None => {
            debug!("Ignoring non merge request hook");
            false
        }
    }
}

// Convenience trait abstracting away IO for testing
#[async_trait]
pub trait RequestExt: Send + Sync {
    async fn do_request(
        &self,
        url: &str,
        http_action: Method,
        token: Option<&str>,
        body: Option<&[u8]>,
    ) -> Result<reqwest::Response>;
}

struct RequestExtImpl;

#[async_trait]
impl RequestExt for RequestExtImpl {
    async fn do_request(
        &self,
        url: &str,
        http_action: Method,
        token: Option<&str>,
        body: Option<&[u8]>,
    ) -> Result<reqwest::Response> {
        let uri = url
            .parse::<Uri>()
            .map_err(|e| format!("Failed to parse url: {e}"))?;

        match (uri.scheme_str(), http_action) {
            (Some("https") | Some("http"), method) => {
                let request = match method {
                    Method::GET => reqwest::Client::new().get(url),
                    Method::PUT => reqwest::Client::new().put(url),
                    _ => {
                        return Err(format!("Unsupported method: {:?}", method).into());
                    }
                };

                let mut headers = HeaderMap::new();
                headers.append(
                    "Content-Type",
                    HeaderValue::from_str("application/json")
                        .map_err(|e| format!("Failed to parse header app/json: {e}"))?,
                );
                if let Some(token) = token {
                    headers.append(
                        "PRIVATE-TOKEN",
                        HeaderValue::from_str(token)
                            .map_err(|e| format!("Failed to parse header private token: {e}"))?,
                    );
                }

                request
                    .headers(headers)
                    .body(body.map(|data| data.to_vec()).unwrap_or_default())
                    .send()
                    .await
                    .map_err(|e| format!("failed to send request: {e}").into())
            }
            _ => Err(format!("Invalid scheme in url: {url}, needs to be 'http' or 'https'").into()),
        }
    }
}

#[derive(Debug, StructOpt, Clone)]
pub struct Options {
    /// The URI of the GitLab instance to connect to
    #[structopt(long, env = "OSCAR_GITLAB_API_URI")]
    pub gitlab_uri: String,
    /// The token to use for authenticating with GitLab
    #[structopt(long, env = "OSCAR_GITLAB_TOKEN")]
    pub gitlab_token: String,
    #[structopt(long, default_value = "main", env = "OSCAR_CONFIG_BRANCH")]
    pub config_branch: String,
    /// The host to listen on
    #[structopt(short, long, default_value = "127.0.0.1", env = "OSCAR_BIND_HOST")]
    pub host: String,
    /// The port to listen on
    #[structopt(short, long, default_value = "8111", env = "OSCAR_BIND_PORT")]
    pub port: u16,
    /// The log level to use, available levels are: trace, debug, info, warn, error
    #[structopt(
        long = "log-level",
        default_value = "info",
        possible_values = &["trace", "debug", "info", "warn", "error"],
        env = "OSCAR_LOG_LEVEL"
    )]
    pub log_level: String,
}

#[derive(Deserialize, Debug)]
pub struct Webhook {
    pub event_type: String,
    pub project: Project,
    pub object_attributes: ObjectAttributes,
}

#[derive(Deserialize, Debug)]
pub struct Project {
    pub id: u64,
}

#[derive(Deserialize, Debug)]
pub struct ObjectAttributes {
    pub iid: u64,
    pub action: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct Changes {
    pub changes: Vec<Change>,
}

#[derive(Deserialize, Debug)]
pub struct Change {
    pub new_path: String,
}

#[derive(Deserialize, Debug)]
pub struct Config {
    pub labels: Vec<Label>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Labels {
    pub labels: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Label {
    pub name: String,
    #[serde(skip_serializing)]
    pub paths: Vec<PathBuf>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use hyper::{header, HeaderMap, Request};
    use once_cell::sync::Lazy;

    static OPTIONS: Lazy<Arc<Options>> = Lazy::new(|| {
        let params = [
            "test-app",
            "--gitlab-uri",
            "http://my-custom-url-for-this-test.com",
            "--gitlab-token",
            "token",
        ];
        Arc::new(Options::from_iter(params))
    });

    #[test]
    fn test_verify_headers_valid() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "X-Gitlab-Event",
            header::HeaderValue::from_static("Merge Request Hook"),
        );

        let req = Request::builder()
            .method("POST")
            .uri("http://example.com/")
            .header("X-Gitlab-Event", "Merge Request Hook")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        assert!(verify_headers(&req).is_ok());
    }

    #[test]
    fn test_verify_headers_missing_header() {
        let req = Request::builder()
            .method("POST")
            .uri("http://example.com/")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        assert!(verify_headers(&req).is_err());
    }

    #[test]
    fn test_verify_headers_invalid_header() {
        let req = Request::builder()
            .method("POST")
            .uri("http://example.com/")
            .header("X-Gitlab-Event", "Some Other Event")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        assert!(verify_headers(&req).is_err());
    }

    #[tokio::test]
    async fn test_parse_route_labeler_path() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/labeler")
            .header("X-Gitlab-Event", "Merge Request Hook")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        let labeler_handle = Arc::new(MockLabelerHandler {});
        let response = parse_route(req, OPTIONS.clone(), labeler_handle)
            .await
            .unwrap();

        assert_eq!(response.status(), 200);
    }

    #[tokio::test]
    async fn test_parse_route_unknown_path() {
        let req = Request::builder()
            .method(Method::POST)
            .uri("/unknown")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        let labeler_handle = Arc::new(MockLabelerHandler {});
        let response = parse_route(req, OPTIONS.clone(), labeler_handle)
            .await
            .unwrap();

        assert_eq!(response.status(), 404);
    }

    #[tokio::test]
    async fn test_parse_route_invalid_method() {
        // Scenario: Request with invalid method
        let req = Request::builder()
            .method(Method::GET)
            .uri("/labeler")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        let labeler_handle = Arc::new(MockLabelerHandler {});
        let response = parse_route(req, OPTIONS.clone(), labeler_handle)
            .await
            .unwrap();

        assert_eq!(response.status(), 405);
    }

    #[tokio::test]
    async fn test_parse_route_invalid_headers() {
        // Scenario: Request with invalid headers
        let req = Request::builder()
            .method(Method::POST)
            .uri("/labeler")
            .body(Full::new(Bytes::from("")))
            .unwrap();

        let labeler_handle = Arc::new(MockLabelerHandler {});
        let response = parse_route(req, OPTIONS.clone(), labeler_handle)
            .await
            .unwrap();

        assert_eq!(response.status(), 401);
    }

    struct MockLabelerHandler;

    #[async_trait]
    impl LabelerHandler for MockLabelerHandler {
        async fn gitlab_handle<T>(
            &self,
            _req: Request<T>,
            _opts: Arc<Options>,
            _req_ext: Box<dyn RequestExt>,
        ) -> Result<()>
        where
            T: hyper::body::Body + Send + Sync + 'static,
            <T as hyper::body::Body>::Error: std::fmt::Debug + std::fmt::Display,
            <T as hyper::body::Body>::Data: Send + Sync + 'static,
        {
            Ok(())
        }
    }

    // write tests for Labeler implementation of LabelerHandler

    #[test]
    fn test_verify_action_valid() {
        let attr = ObjectAttributes {
            iid: 0,
            action: Some("open".to_string()),
        };

        assert!(verify_action(&attr));

        let attr = ObjectAttributes {
            iid: 0,
            action: Some("reopen".to_string()),
        };

        assert!(verify_action(&attr));
    }

    #[test]
    fn test_verify_action_invalid() {
        let attr = ObjectAttributes {
            iid: 0,
            action: Some("close".to_string()),
        };

        assert!(!verify_action(&attr));
    }
}
