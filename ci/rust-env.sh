# shellcheck shell=bash
# Sourced from a checkout by the check and warm jobs
RUSTUP_TOOLCHAIN="$(cat /opt/rust/toolchain)"
export RUSTUP_TOOLCHAIN
pinned="$(sed -n 's/^channel = "\(.*\)"/\1/p' rust-toolchain.toml)"
[ "$RUSTUP_TOOLCHAIN" = "$pinned" ] \
	|| { echo "FATAL: image has Rust $RUSTUP_TOOLCHAIN but rust-toolchain.toml pins $pinned — re-bake the check image"; exit 1; }
