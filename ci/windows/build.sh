#!/bin/sh
# Cross-builds both Windows installers on the Linux build box.
set -eu

version=$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)
[ -n "$version" ] || { echo "FATAL: no version in src-tauri/tauri.conf.json" >&2; exit 1; }

installer() {
	label=$1
	triple=$2
	arch=$3
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
}

installer x64 x86_64-pc-windows-msvc x86_64
installer arm64 aarch64-pc-windows-msvc arm64
