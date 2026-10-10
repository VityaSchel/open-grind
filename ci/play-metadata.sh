#!/bin/sh
set -eu

root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/build/play-metadata/android"
repo=https://git.opengrind.org/open-grind/open-grind

rm -rf "$out"
mkdir -p "$(dirname "$out")"
cp -R "$root/fastlane/metadata/android" "$out"

for dir in "$out"/*/; do
	locale=$(basename "$dir")
	case "$locale" in
		en-US)
			short="Unofficial Grindr client. Open source, libre, privacy-centered, by the community"
			source_label="Source code"
			;;
		*)
			echo "no Play listing text for locale $locale; add it to ci/play-metadata.sh" >&2
			exit 1
			;;
	esac
	printf '%s\n' "$short" >"$dir/short_description.txt"
	printf '\n%s: %s\n' "$source_label" "$repo" >>"$dir/full_description.txt"
done

echo "Play listing metadata written to $out"
