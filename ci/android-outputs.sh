#!/bin/sh
set -eu

app="$(cd "$(dirname "$0")/../src-tauri/gen/android/app" && pwd -P)"
version="$(sed -n 's/^tauri\.android\.versionName=//p' "$app/tauri.properties")"
if [ -f "$app/../keystore.properties" ]; then unsigned=""; else unsigned="-unsigned"; fi
produced=0

for src in "$app"/build/outputs/apk/*/release/app-*-release*.apk "$app"/build/outputs/bundle/*Release/app-*-release.aab; do
	[ -f "$src" ] || continue
	file="$(basename "$src")"
	flavor="${file#app-}"
	flavor="${flavor%%-release*}"
	case "$flavor" in
	universal) abi="" ;;
	arm) abi="-armeabi-v7a" ;;
	arm64) abi="-arm64-v8a" ;;
	x86) abi="-x86" ;;
	x86_64) abi="-x86_64" ;;
	*)
		echo "no asset name for the $flavor flavor" >&2
		exit 1
		;;
	esac
	artifact="$(dirname "$src")/open-grind-v$version-android$abi$unsigned.${file##*.}"
	mv -f "$src" "$artifact"
	printf 'Produced: %s (%s)\n' "$artifact" "$(du -h "$artifact" | cut -f1)"
	produced=$((produced + 1))
done
if [ "$produced" -eq 0 ]; then
	echo "no Android build outputs under $app/build/outputs" >&2
	exit 1
fi
