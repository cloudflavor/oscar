use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper_util::rt::TokioIo;
use oscar::{parse_route, Labeler, Options, Result};
use std::net::SocketAddr;
use std::sync::Arc;
use structopt::StructOpt;
use tokio::net::TcpListener;
use tracing::{debug, error, info};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<()> {
    let opts = Options::from_args();
    let op = opts.clone();

    let safe_opts = Arc::new(opts.clone());
    let log_level = EnvFilter::new(opts.log_level);

    let subscriber = tracing_subscriber::fmt::Subscriber::builder()
        .with_env_filter(log_level)
        .with_ansi(true)
        .with_writer(std::io::stdout)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    debug!("Starting with options: {:#?}", &op);

    let addr = format!("{}:{}", opts.host, opts.port)
        .parse::<SocketAddr>()
        .map_err(|e| {
            error!("failed to parse host: {e}");
            e
        })?;
    let listener = TcpListener::bind(addr).await?;

    info!("Listening on http://{}", addr);
    loop {
        let (stream, _) = listener.accept().await?;
        let io = TokioIo::new(stream);
        let safe_opts = safe_opts.clone();
        let labeler = Labeler;
        let labeler_handle = Arc::new(labeler);

        tokio::task::spawn(async move {
            if let Err(e) = http1::Builder::new()
                .serve_connection(
                    io,
                    service_fn(move |req| {
                        parse_route(req, safe_opts.clone(), labeler_handle.clone())
                    }),
                )
                .await
            {
                error!("failed to start connection: {e}");
            }
        });
    }
}
