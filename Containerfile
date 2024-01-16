FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY target/debug/oscar /opt/oscar/bin/oscar

RUN chmod +x /opt/oscar/bin/oscar
RUN chown -R 1000:1000 /opt/oscar

USER 1000

ENTRYPOINT ["/opt/oscar/bin/oscar"]