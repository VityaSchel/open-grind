#!/bin/sh
# Runs inside the ci/linux image with the repo mounted at /work.
set -eu

# The mount belongs to the host user; the ephemeral container runs as root.
git config --global --add safe.directory /work

export TZ=UTC LC_ALL=C LANG=C
SOURCE_DATE_EPOCH=$(git -C /work log -1 --pretty=%ct)
export SOURCE_DATE_EPOCH
export CARGO_HOME="${CARGO_HOME:-/root/.cargo}"
export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$CARGO_HOME=/cargo --remap-path-prefix=/work=/open-grind"
prefixMaps="-ffile-prefix-map=$CARGO_HOME=/cargo -ffile-prefix-map=/work=/open-grind"
export CFLAGS="${CFLAGS:-} $prefixMaps"
export CXXFLAGS="${CXXFLAGS:-} $prefixMaps"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

cd /work
# bun's tarball extraction and hardlink install both break on overlayfs, so
# keep the cache on the mounted filesystem and copy instead of hardlinking.
export BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-/work/.bun-cache}"
bun install --frozen-lockfile --backend copyfile
bun run tauri build --bundles deb

out="/work/src-tauri/target/release"
bin="$out/open-grind"

interp=$(readelf -l "$bin" | sed -n 's/.*interpreter: \(.*\)]/\1/p')
case "$interp" in
	/lib/*|/lib64/*) ;;
	*) echo "FATAL: unexpected ELF interpreter '$interp'" >&2; exit 1 ;;
esac
if objdump -p "$bin" | grep -qE "RUNPATH|RPATH"; then
	echo "FATAL: binary carries a RUNPATH" >&2
	objdump -p "$bin" | grep -E "RUNPATH|RPATH" >&2
	exit 1
fi

echo
echo "interpreter: $interp"
echo "glibc floor: $(objdump -T "$bin" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)"
find "$out/bundle/deb" -maxdepth 1 -name '*.deb' -print
