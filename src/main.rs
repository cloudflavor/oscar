use http_body_util::Full;
use hyper::body::Bytes;
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::Uri;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use reqwest::Client;
use std::convert::Infallible;
use std::net::SocketAddr;
use structopt::StructOpt;
use tokio::net::TcpListener;
use tracing::{debug, error, info};
use tracing_subscriber::EnvFilter;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

#[derive(Debug, StructOpt)]
struct Options {
    #[structopt(long, env = "GITLAB_BOT_GITLAB_URI")]
    gitlab_uri: String,
    #[structopt(long, env = "GITLAB_BOT_GITLAB_TOKEN")]
    gitlab_token: String,
    #[structopt(short, long)]
    config_uri: String,
    #[structopt(short, long, default_value = "8111")]
    port: u16,
    #[structopt(short, long, default_value = "127.0.0.1")]
    host: String,
    #[structopt(
        long = "log-level",
        default_value = "info",
        possible_values = &["trace", "debug", "info", "warn", "error"],
        env = "GITLAB_BOT_LOG_LEVEL"
    )]
    log_level: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let opts = Options::from_args();
    let log_level = EnvFilter::new(opts.log_level);

    let subscriber = tracing_subscriber::fmt::Subscriber::builder()
        .with_env_filter(log_level)
        .with_ansi(true)
        .with_writer(std::io::stdout)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    let addr = SocketAddr::from(
        format!("{}:{}", opts.host, opts.port)
            .parse::<SocketAddr>()
            .map_err(|e| {
                error!("failed to parse host: {}", e);
                e
            })?,
    );
    let listener = TcpListener::bind(addr).await?;

    info!("Listening on http://{}", addr);
    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);

        tokio::task::spawn(async move {
            if let Err(e) = http1::Builder::new()
                .serve_connection(io, service_fn(parse_route))
                .await
            {
                error!("failed to start connection: {e}");
            }
        });
    }
}

async fn parse_route(
    req: Request<hyper::body::Incoming>,
) -> std::result::Result<Response<Full<Bytes>>, Infallible> {
    debug!("req: {:?}", req);

    match req.uri().path() {
        "/webhook" => {
            if let Err(err) = gitlab_webhook(req).await {
                error!("failed to parse webhook: {}", err);
            }
        }
        _ => {
            error!("unknown route: {}", req.uri().path());

            let resp = Response::builder()
                .status(404)
                .body(Full::new(Bytes::from("")))
                .unwrap();
            return Ok(resp);
        }
    }

    Ok(Response::new(Full::new(Bytes::from(""))))
}

async fn gitlab_webhook(req: Request<hyper::body::Incoming>) -> Result<()> {
    // let body = hyper::body::aggregate(req.into_body()).await?;
    // let body = String::from_utf8(body.to_vec())?;
    // info!("body: {body}");
    Ok(())
}
pub enum GetPost {
    Get,
    Post,
}

pub async fn fetch_data(url: &str, http_action: GetPost) -> Result<()> {
    let uri = url
        .parse::<Uri>()
        .map_err(|e| format!("Failed to parse url: {e}"))?;

    match uri.scheme_str() {
        Some("https") | Some("http") => {
            let client = Client::new();
            let resp = match http_action {
                GetPost::Get => client.get(url).send().await?,
                GetPost::Post => client.post(url).send().await?,
            };
            debug!("resp: {:?}", resp);
        }
        _ => return Err(format!("Invalid scheme in url: {url}, need 'http' or 'https'").into()),
    };

    // Ok(resp.into_body())
    Ok(())
}
