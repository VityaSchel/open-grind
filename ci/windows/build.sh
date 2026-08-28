#!/bin/sh
# Cross-builds one Windows installer on the Linux build box.
set -eu

label=${1:-}
case "$label" in
x64) triple=x86_64-pc-windows-msvc; arch=x86_64 ;;
arm64) triple=aarch64-pc-windows-msvc; arch=arm64 ;;
*) echo "usage: build.sh <x64|arm64>" >&2; exit 2 ;;
esac

version=$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)
[ -n "$version" ] || { echo "FATAL: no version in src-tauri/tauri.conf.json" >&2; exit 1; }
nsis="src-tauri/target/$triple/release/bundle/nsis"

nix run ".#build-windows-$label"

set -- "$nsis"/*-setup.exe
[ -e "$1" ] || set --
if [ "$#" -ne 1 ]; then
	echo "FATAL: expected one $label installer, found $#" >&2
	exit 1
fi
asset="$nsis/open-grind-v$version-windows-$arch.exe"
mv "$1" "$asset"
sha256sum "$asset"
