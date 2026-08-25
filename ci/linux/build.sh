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

# tauri-bundler walks directories unsorted and stamps wall-clock mtimes into
# both tars and the ar header, so the .deb never reproduces as built:
# https://github.com/tauri-apps/tauri/issues/13612
set -- "$out"/bundle/deb/*.deb
[ "$#" -eq 1 ] || { echo "FATAL: expected one .deb, found $#" >&2; exit 1; }
bundled=$1
work=$(mktemp -d)
dpkg-deb --raw-extract "$bundled" "$work/root"
LC_ALL=C sort -k2 -o "$work/root/DEBIAN/md5sums" "$work/root/DEBIAN/md5sums"
find "$work/root" -exec touch -h -d "@$SOURCE_DATE_EPOCH" {} +
# tauri-bundler sums directory entry sizes into Installed-Size, and those are
# filesystem-specific; policy defines it from file sizes plus 1 KiB per directory:
# https://www.debian.org/doc/debian-policy/ch-controlfields.html#s-f-installed-size
files_kib=$(cd "$work/root" && find . -path ./DEBIAN -prune -o -type f -printf '%s\n' | awk '{ s += int(($1 + 1023) / 1024) } END { print s + 0 }')
dirs=$(cd "$work/root" && find . -path ./DEBIAN -prune -o -type d -print | wc -l)
sed -i "s/^Installed-Size: .*/Installed-Size: $((files_kib + dirs))/" "$work/root/DEBIAN/control"
version=$(sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' src-tauri/tauri.conf.json | head -1)
case "$(uname -m)" in aarch64) arch=arm64 ;; *) arch=$(uname -m) ;; esac
deb="$out/bundle/deb/open-grind-v$version-linux-$arch.deb"
dpkg-deb --root-owner-group -Zgzip -z9 --uniform-compression -b "$work/root" "$deb"
rm -rf "$work" "$bundled"

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
