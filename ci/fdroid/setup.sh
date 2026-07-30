#!/bin/sh
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git gnupg nodejs unzip
# shellcheck disable=SC1091  # provided by the image
. /etc/os-release
install -m 0755 -d /etc/apt/keyrings
DOCKER_GPG_FINGERPRINT=9DC858229FC7DD38854AE2D88D81803C0EBFCD88
curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc \
	| awk -F: '$1 == "fpr" { print $10 }' \
	| grep -qx "$DOCKER_GPG_FINGERPRINT" \
	|| { echo "docker signing key is not $DOCKER_GPG_FINGERPRINT" >&2; exit 1; }
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io
BUN_VERSION=1.3.14
BUN_SHA256=a063908ae08b7852ca10939bbdc6ceed3ddabce8fb9402dce83d65d73b36e6c7
curl -fsSL -o /tmp/bun.zip "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64-baseline.zip"
echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c -
unzip -q /tmp/bun.zip -d /opt
ln -s /opt/bun-linux-x64-baseline/bun /usr/local/bin/bun
