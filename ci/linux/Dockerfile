# Canonical Linux release builder: links against Debian 12's system libraries.
FROM debian@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241

# A snapshot older than the base image fails apt with "held broken packages".
ARG SNAPSHOT=20260820T000000Z
RUN echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/${SNAPSHOT} bookworm main" > /etc/apt/sources.list \
	&& echo "deb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/${SNAPSHOT} bookworm-security main" >> /etc/apt/sources.list \
	&& rm -f /etc/apt/sources.list.d/debian.sources

RUN apt-get -o Acquire::Check-Valid-Until=false update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
	build-essential clang libclang-dev pkg-config cmake ninja-build perl git ca-certificates curl xz-utils \
	libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev libssl-dev \
	binutils file \
	&& rm -rf /var/lib/apt/lists/*

ARG RUST_VERSION=1.95.0
RUN curl -fsSL https://static.rust-lang.org/rustup/dist/$(uname -m)-unknown-linux-gnu/rustup-init -o /tmp/rustup-init \
	&& chmod +x /tmp/rustup-init \
	&& /tmp/rustup-init -y --no-modify-path --profile minimal --default-toolchain ${RUST_VERSION} \
	&& rm /tmp/rustup-init
ENV PATH=/root/.cargo/bin:$PATH

# vite must run under node, not bun: bun's JSC changes chunk hashing.
ARG NODE_VERSION=24.14.1
RUN A=$(uname -m); case "$A" in aarch64) N=arm64;; x86_64) N=x64;; esac \
	&& curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${N}.tar.xz" -o /tmp/node.txz \
	&& tar -xJf /tmp/node.txz -C /opt && mv /opt/node-v${NODE_VERSION}-linux-${N} /opt/node && rm /tmp/node.txz
ENV PATH=/opt/node/bin:$PATH

ARG BUN_VERSION=1.3.13
RUN A=$(uname -m); case "$A" in aarch64) B=aarch64;; x86_64) B=x64;; esac \
	&& curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${B}.zip" -o /tmp/bun.zip \
	&& apt-get -o Acquire::Check-Valid-Until=false update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* \
	&& unzip -q /tmp/bun.zip -d /opt && mv /opt/bun-linux-* /opt/bun && rm /tmp/bun.zip
ENV PATH=/opt/bun:$PATH

WORKDIR /work
