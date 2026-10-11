#!/usr/bin/env bash
# Must match nix/android.nix
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$ROOT"

property() {
	awk -F= -v key="$2" '$1 == key { print substr($0, length(key) + 2) }' "$1"
}
pin() { property "$ROOT/ci/fdroid/toolchain.properties" "$1"; }
android() { property "$ROOT/src-tauri/gen/android/gradle.properties" "opengrind.android.$1"; }

fetch() {
	curl -fsSL --retry 3 -o "$3" "$1"
	echo "$2  $3" | sha256sum -c -
}

TOOLS="${OPEN_GRIND_TOOLCHAIN_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/open-grind-toolchain}"
mkdir -p "$TOOLS"

node_version="$(pin node.version)"
node_dir="$TOOLS/node-v$node_version-linux-x64"
if [ ! -x "$node_dir/bin/node" ]; then
	fetch "https://nodejs.org/dist/v$node_version/node-v$node_version-linux-x64.tar.gz" \
		"$(pin node.sha256)" "$TOOLS/node.tar.gz"
	tar -xzf "$TOOLS/node.tar.gz" -C "$TOOLS"
	rm "$TOOLS/node.tar.gz"
fi

bun_version="$(pin bun.version)"
bun_dir="$TOOLS/bun-v$bun_version"
if [ ! -x "$bun_dir/bin/bun" ]; then
	fetch "https://github.com/oven-sh/bun/releases/download/bun-v$bun_version/bun-linux-x64.zip" \
		"$(pin bun.sha256)" "$TOOLS/bun.zip"
	unzip -q -o "$TOOLS/bun.zip" -d "$TOOLS"
	mkdir -p "$bun_dir/bin"
	mv "$TOOLS/bun-linux-x64/bun" "$bun_dir/bin/bun"
	ln -sf bun "$bun_dir/bin/bunx"
	rm -r "$TOOLS/bun.zip" "$TOOLS/bun-linux-x64"
fi

libclang_version="$(pin libclang.version)"
libclang_major="${libclang_version%%.*}"
libclang_installed="$(dpkg-query -W -f='${Version}' "libclang1-$libclang_major")"
case "$libclang_installed" in
*:"$libclang_version"-*) ;;
*)
	echo "libclang1-$libclang_major is $libclang_installed, the flake uses $libclang_version" >&2
	exit 1
	;;
esac

rustup toolchain install "$(sed -n 's/^channel = "\(.*\)"$/\1/p' rust-toolchain.toml)" --profile minimal \
	--target aarch64-linux-android,armv7-linux-androideabi,i686-linux-android,x86_64-linux-android

sdk="${ANDROID_HOME:?ANDROID_HOME must point at the Android SDK}"
build_tools="$(android buildTools)"
cmake="$(android cmake)"
ndk="$(android ndk)"
missing=()
for package in "platforms;android-$(android compileSdk)" "build-tools;$build_tools" "cmake;$cmake" "ndk;$ndk"; do
	[ -d "$sdk/${package//;//}" ] || missing+=("$package")
done
if [ ${#missing[@]} -gt 0 ]; then
	sdkmanager "${missing[@]}"
fi
ndk_root="$sdk/ndk/$ndk"

unset SOURCE_DATE_EPOCH
CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export CARGO_HOME
export JAVA_HOME="${OPEN_GRIND_JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"
export ANDROID_HOME="$sdk"
export ANDROID_SDK_ROOT="$sdk"
export ANDROID_NDK_HOME="$ndk_root"
export ANDROID_NDK_ROOT="$ndk_root"
export NDK_HOME="$ndk_root"
export LIBCLANG_PATH="/usr/lib/llvm-$libclang_major/lib"
export CMAKE_GENERATOR=Ninja
export PATH="$sdk/build-tools/$build_tools:$sdk/cmake/$cmake/bin:$CARGO_HOME/bin:$bun_dir/bin:$node_dir/bin:$JAVA_HOME/bin:$PATH"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"

export RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$CARGO_HOME=/cargo --remap-path-prefix=$ROOT=/open-grind"
prefixMaps="-ffile-prefix-map=$CARGO_HOME=/cargo -ffile-prefix-map=$ROOT=/open-grind"
export CFLAGS="${CFLAGS:-} $prefixMaps"
export CXXFLAGS="${CXXFLAGS:-} $prefixMaps"

bun run --cwd "$ROOT" patch-deps

export GRADLE_USER_HOME="${OPEN_GRIND_GRADLE_USER_HOME:-$HOME/.gradle-opengrind}"
mkdir -p "$GRADLE_USER_HOME"
printf 'android.aapt2FromMavenOverride=%s/aapt2\n' "$sdk/build-tools/$build_tools" > "$GRADLE_USER_HOME/gradle.properties"

bun ci
if [ -n "${OPEN_GRIND_ANDROID_ABI:-}" ]; then
	bun run tauri android build --apk --target "$OPEN_GRIND_ANDROID_ABI"
else
	bun run tauri android build --apk
fi

reldir="$ROOT/src-tauri/gen/android/app/build/outputs/apk/universal/release"
version="$(sed -n 's/^tauri\.android\.versionName=//p' "$ROOT/src-tauri/gen/android/app/tauri.properties")"
artifact="$reldir/open-grind-v$version-android-unsigned.apk"
mv -f "$reldir/app-universal-release-unsigned.apk" "$artifact"
printf 'Produced: %s (%s)\n' "$artifact" "$(du -h "$artifact" | cut -f1)"
