#!/bin/sh
set -eu

tool=${1:-}
case "$tool" in
podman | nix) ;;
*) echo "usage: setup-build.sh <podman|nix>" >&2; exit 2 ;;
esac

export DEBIAN_FRONTEND=noninteractive
apt-get -qq update
apt-get -qq install -y ca-certificates curl git nodejs xz-utils

if [ "$tool" = podman ]; then
	apt-get -qq install -y podman
	exit 0
fi

NIX_VERSION=2.26.3
NIX_SHA256_X86_64=d378a057253fb98f05c3e7c431c1852cca6afae3376f5853a9fcb7ae423a05ad
NIX_SHA256_AARCH64=8e52a0ff91b14a3fd7e5bdf5abe263c732b8655ecc67d7730844bb90e2203416
case "$(uname -m)" in
x86_64) NIX_PLATFORM=x86_64-linux; NIX_SHA256=$NIX_SHA256_X86_64 ;;
aarch64) NIX_PLATFORM=aarch64-linux; NIX_SHA256=$NIX_SHA256_AARCH64 ;;
*) echo "no pinned nix release for $(uname -m)" >&2; exit 1 ;;
esac
NIX_RELEASE="nix-${NIX_VERSION}-${NIX_PLATFORM}"
curl -fsSL -o /tmp/nix.tar.xz "https://releases.nixos.org/nix/nix-${NIX_VERSION}/${NIX_RELEASE}.tar.xz"
echo "${NIX_SHA256}  /tmp/nix.tar.xz" | sha256sum -c -
tar -C /tmp -xf /tmp/nix.tar.xz
"/tmp/${NIX_RELEASE}/install" --daemon --yes
printf '%s\n' "experimental-features = nix-command flakes" >> /etc/nix/nix.conf
systemctl restart nix-daemon
ln -s /nix/var/nix/profiles/default/bin/nix /usr/local/bin/nix
