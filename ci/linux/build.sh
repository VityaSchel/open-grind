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

# tauri's appimage bundler downloads linuxdeploy at build time and over-bundles
# until the result dies on Mesa 25+: https://github.com/tauri-apps/tauri/issues/15665
runtime="${APPIMAGE_RUNTIME:-/opt/appimage-runtime}"
[ -f "$runtime" ] || { echo "FATAL: no AppImage runtime at $runtime" >&2; exit 1; }

appdir=$(mktemp -d)/AppDir
mkdir -p "$appdir"
dpkg-deb --fsys-tarfile "$deb" | tar -x -C "$appdir"

set -- "$appdir"/usr/share/applications/*.desktop
[ "$#" -eq 1 ] && [ -f "$1" ] || { echo "FATAL: expected one .desktop in the payload, found $#" >&2; exit 1; }
desktop=$1
icon=$(sed -n 's/^Icon=//p' "$desktop" | head -1)
[ -n "$icon" ] || { echo "FATAL: $desktop declares no Icon" >&2; exit 1; }

largest_icon=$(find "$appdir/usr/share/icons" -name "$icon.png" -printf '%s %p\n' | sort -rn | head -1 | cut -d' ' -f2-)
[ -n "$largest_icon" ] || { echo "FATAL: no $icon.png under usr/share/icons" >&2; exit 1; }

cp "$desktop" "$appdir/"
cp "$largest_icon" "$appdir/$icon.png"
cp "$largest_icon" "$appdir/.DirIcon"

cat > "$appdir/AppRun" <<'APPRUN'
#!/bin/sh
bin="$(dirname "$(readlink -f "$0")")/usr/bin/open-grind"

if LD_TRACE_LOADED_OBJECTS=1 "$bin" 2>/dev/null | grep -q 'libwebkit2gtk-4.1.so.0 => not found'; then
	missing="Open Grind needs WebKitGTK 4.1, which is not installed.

Install libwebkit2gtk-4.1-0 (Debian, Ubuntu), webkit2gtk-4.1 (Arch), webkit2gtk4.1 (Fedora) or libwebkit2gtk-4_1-0 (openSUSE), then start Open Grind again."
	echo "$missing" >&2
	zenity --error --no-wrap --text="$missing" 2>/dev/null ||
		kdialog --error "$missing" 2>/dev/null ||
		xmessage -center "$missing" 2>/dev/null ||
		notify-send "Open Grind" "$missing" 2>/dev/null ||
		true
	exit 1
fi

exec "$bin" "$@"
APPRUN
chmod 0755 "$appdir/AppRun"

# mksquashfs refuses -mkfs-time and -all-time when SOURCE_DATE_EPOCH is set
find "$appdir" -exec touch -h -d "@$SOURCE_DATE_EPOCH" {} +
sqfs=$(mktemp -u)
mksquashfs "$appdir" "$sqfs" -comp zstd -b 128K -noappend -no-progress -no-xattrs \
	-all-root -processors 1
mkdir -p "$out/bundle/appimage"
appimage="$out/bundle/appimage/open-grind-v$version-linux-$arch.AppImage"
cat "$runtime" "$sqfs" > "$appimage"
chmod 0755 "$appimage"
rm -rf "$sqfs" "$(dirname "$appdir")"

echo
echo "interpreter: $interp"
echo "glibc floor: $(objdump -T "$bin" | grep -o 'GLIBC_[0-9.]*' | sort -Vu | tail -1)"
find "$out/bundle" -maxdepth 2 -type f \( -name '*.deb' -o -name '*.AppImage' \) -print
sha256sum "$deb" "$appimage"
