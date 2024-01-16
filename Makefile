# Makefile

.PHONY: clippy build build-dev container

dev: build-dev 

dev-publish: build-dev container-dev push-dev

production: clippy build container push

clippy:
	@echo "Running clippy..."
	cargo clippy -- -D warnings

build-dev:
	@echo "Building project..."
	cargo build

build:
	@echo "Building project..."
	cargo build --release

container-dev:
	@echo "Building container container..."
	podman build -t quay.io/cloudflavor/oscar:v0.2-dev .

container:
	@echo "Building container..."
	podman build -t quay.io/cloudflavor/oscar:v0.2 .

push:
	@echo "Pushing container..."
	podman push quay.io/cloudflavor/oscar:v0.2

push-dev:
	@echo "Pushing container..."
	podman push quay.io/cloudflavor/oscar:v0.2-dev
