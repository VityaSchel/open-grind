#!/usr/bin/env bash
set -euxo pipefail
export DEBIAN_FRONTEND=noninteractive

BUN_VERSION=1.3.14
RUST_VERSION=1.95.0

apt-get update -y
apt-get install -y --no-install-recommends \
	ca-certificates curl git tar unzip \
	build-essential cmake ninja-build pkg-config perl golang clang libclang-dev \
	libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
	librsvg2-dev libxdo-dev libayatana-appindicator3-dev libssl-dev

export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
curl -fsSL https://sh.rustup.rs \
	| sh -s -- -y --no-modify-path --profile minimal \
		--default-toolchain "$RUST_VERSION" -t x86_64-unknown-linux-gnu
printf '%s' "$RUST_VERSION" > /opt/rust/toolchain

export BUN_INSTALL=/opt/bun
curl -fsSL https://bun.sh/install | bash -s -- "bun-v${BUN_VERSION}"

for bin in /opt/bun/bin/bun /opt/bun/bin/bunx \
	/opt/rust/cargo/bin/cargo /opt/rust/cargo/bin/rustc /opt/rust/cargo/bin/rustup; do
	ln -sf "$bin" /usr/local/bin/
done

apt-get clean
rm -rf /var/lib/apt/lists/*
