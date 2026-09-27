#!/usr/bin/env bash
set -euxo pipefail

# export CI_SSH_KEY=~/.ssh/open-grind-ci
# export IP=<box ip>
# scp -o IdentitiesOnly=yes -i "$CI_SSH_KEY" ci/check-image.sh ci/snapshot-clean.sh "root@$IP:/tmp/"
# ssh -o IdentitiesOnly=yes -i "$CI_SSH_KEY" "root@$IP"
# > bash /tmp/check-image.sh
# > export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
# > bun --version && node --version && cargo --version && rustc --version
# > cargo fmt --version && cargo clippy --version
# > cat /opt/rust/toolchain
# > PLAYWRIGHT_BROWSERS_PATH=/opt/playwright ls /opt/playwright
# > git --version && curl --version | head -1
# > cargo deny --version && cargo about --version && zip -v | head -2
# > pkg-config --modversion gstreamer-1.0
# > bash /tmp/snapshot-clean.sh; poweroff

export DEBIAN_FRONTEND=noninteractive

BUN_VERSION=1.3.14
BUN_SHA256=a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7
NODE_VERSION=24.13.1
NODE_SHA256=30215f90ea3cd04dfbc06e762c021393fa173a1d392974298bbc871a8e461089
# grindr.rs .forgejo/workflows/crates.yml pins the same version and fails on a mismatch.
RUST_VERSION=1.95.0
RUSTUP_VERSION=1.29.0
RUSTUP_SHA256=4acc9acc76d5079515b46346a485974457b5a79893cfb01112423c89aeb5aa10
# Must match @playwright/test in package.json; a mismatch makes e2e demand its own download.
PLAYWRIGHT_VERSION=1.61.1
PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
export PLAYWRIGHT_BROWSERS_PATH
CARGO_DENY_VERSION=0.20.2
CARGO_DENY_SHA256=9f12ed4c49936e09b48bf862b595cde2fe64fcbd9d74dfacac6131ca824c8d5f
CARGO_ABOUT_VERSION=0.9.2
CARGO_ABOUT_SHA256=9099a59e820c38a68b9d65f300662a567d56562f9a10f6aa4c7e86c17c2566af

apt-get update -y
apt-get install -y --no-install-recommends \
	ca-certificates curl git tar unzip zip xz-utils jq minisign \
	build-essential cmake ninja-build pkg-config perl golang clang libclang-dev \
	libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev libgstreamer1.0-dev \
	librsvg2-dev libxdo-dev libayatana-appindicator3-dev libssl-dev

export RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
curl -fsSL -o /tmp/rustup-init \
	"https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/x86_64-unknown-linux-gnu/rustup-init"
echo "${RUSTUP_SHA256}  /tmp/rustup-init" | sha256sum -c -
chmod +x /tmp/rustup-init
/tmp/rustup-init -y --no-modify-path --profile minimal \
	--default-toolchain "$RUST_VERSION" -t x86_64-unknown-linux-gnu --component clippy,rustfmt
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

install_embark() {
	local name=$1 version=$2 sha256=$3
	local triple=x86_64-unknown-linux-musl
	curl -fsSL -o "/tmp/${name}.tar.gz" \
		"https://github.com/EmbarkStudios/${name}/releases/download/${version}/${name}-${version}-${triple}.tar.gz"
	echo "${sha256}  /tmp/${name}.tar.gz" | sha256sum -c -
	tar -xzf "/tmp/${name}.tar.gz" -C /tmp
	install -m 0755 "/tmp/${name}-${version}-${triple}/${name}" "/usr/local/bin/${name}"
	rm -rf "/tmp/${name}.tar.gz" "/tmp/${name}-${version}-${triple}"
}
install_embark cargo-deny "$CARGO_DENY_VERSION" "$CARGO_DENY_SHA256"
install_embark cargo-about "$CARGO_ABOUT_VERSION" "$CARGO_ABOUT_SHA256"

/opt/bun/bin/bunx "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium
{
	printf 'PLAYWRIGHT_BROWSERS_PATH=%s\n' "$PLAYWRIGHT_BROWSERS_PATH"
	printf 'RUSTUP_HOME=%s\n' "$RUSTUP_HOME"
} >> /etc/environment

rm -f /tmp/rustup-init /tmp/bun.zip /tmp/node.tar.xz
apt-get clean
rm -rf /var/lib/apt/lists/*
