#!/usr/bin/env bash
set -euxo pipefail

# export CI_SSH_KEY=~/.ssh/open-grind-ci
# export IP=<box ip>
# scp -o IdentitiesOnly=yes -i "$CI_SSH_KEY" ci/check-image.sh ci/snapshot-clean.sh "root@$IP:/tmp/"
# ssh -o IdentitiesOnly=yes -i "$CI_SSH_KEY" "root@$IP"
# > bash /tmp/check-image.sh
# > export RUSTUP_HOME=/opt/rust/rustup
# > bun --version && node --version && cargo --version && rustc --version
# > cat /opt/rust/toolchain
# > PLAYWRIGHT_BROWSERS_PATH=/opt/playwright ls /opt/playwright
# > git --version && curl --version | head -1
# > bash /tmp/snapshot-clean.sh; poweroff

export DEBIAN_FRONTEND=noninteractive

BUN_VERSION=1.3.14
BUN_SHA256=a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7
NODE_VERSION=24.13.1
NODE_SHA256=30215f90ea3cd04dfbc06e762c021393fa173a1d392974298bbc871a8e461089
RUST_VERSION=1.95.0
RUSTUP_VERSION=1.29.0
RUSTUP_SHA256=4acc9acc76d5079515b46346a485974457b5a79893cfb01112423c89aeb5aa10
# Must match @playwright/test in package.json; a mismatch makes e2e demand its own download.
PLAYWRIGHT_VERSION=1.61.1
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
export PLAYWRIGHT_BROWSERS_PATH

apt-get update -y
apt-get install -y --no-install-recommends \
	ca-certificates curl git tar unzip xz-utils jq minisign \
	build-essential cmake ninja-build pkg-config perl golang clang libclang-dev \
	libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
	librsvg2-dev libxdo-dev libayatana-appindicator3-dev libssl-dev

export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
curl -fsSL -o /tmp/rustup-init \
	"https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init"
echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c -
chmod +x /tmp/rustup-init
/tmp/rustup-init -y --no-modify-path --profile minimal \
	--default-toolchain "$RUST_VERSION" -t x86_64-unknown-linux-gnu
printf '%s' "$RUST_VERSION" > /opt/rust/toolchain

curl -fsSL -o /tmp/bun.zip \
	"https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64-baseline.zip"
echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c -
unzip -q /tmp/bun.zip -d /opt
mkdir -p /opt/bun/bin
mv /opt/bun-linux-x64-baseline/bun /opt/bun/bin/bun
ln -sf /opt/bun/bin/bun /opt/bun/bin/bunx
rmdir /opt/bun-linux-x64-baseline

# Bug in bun's node shim causes eslint type-aware rules allocate without bound
curl -fsSL -o /tmp/node.tar.xz \
	"https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
echo "${NODE_SHA256}  /tmp/node.tar.xz" | sha256sum -c -
tar -xJ -C /opt -f /tmp/node.tar.xz
mv "/opt/node-v${NODE_VERSION}-linux-x64" /opt/node

for bin in /opt/bun/bin/bun /opt/bun/bin/bunx /opt/node/bin/node \
	/opt/rust/cargo/bin/cargo /opt/rust/cargo/bin/rustc /opt/rust/cargo/bin/rustup; do
	ln -sf "$bin" /usr/local/bin/
done

/opt/bun/bin/bunx "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium
{
	printf 'PLAYWRIGHT_BROWSERS_PATH=%s\n' "$PLAYWRIGHT_BROWSERS_PATH"
	printf 'RUSTUP_HOME=%s\n' "$RUSTUP_HOME"
} >> /etc/environment

rm -f /tmp/rustup-init /tmp/bun.zip /tmp/node.tar.xz
apt-get clean
rm -rf /var/lib/apt/lists/*
