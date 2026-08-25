#!/bin/sh
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git nodejs xz-utils podman
NIX_VERSION=2.26.3
NIX_SHA256=d378a057253fb98f05c3e7c431c1852cca6afae3376f5853a9fcb7ae423a05ad
curl -fsSL -o /tmp/nix.tar.xz "https://releases.nixos.org/nix/nix-${NIX_VERSION}/nix-${NIX_VERSION}-x86_64-linux.tar.xz"
echo "${NIX_SHA256}  /tmp/nix.tar.xz" | sha256sum -c -
tar -C /tmp -xf /tmp/nix.tar.xz
"/tmp/nix-${NIX_VERSION}-x86_64-linux/install" --daemon --yes
printf '%s\n' "experimental-features = nix-command flakes" >> /etc/nix/nix.conf
systemctl restart nix-daemon
ln -s /nix/var/nix/profiles/default/bin/nix /usr/local/bin/nix
