#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/config.env"
downloads="${1:?usage: ci/verify.sh <downloads dir> <output dir>}"
out="${2:?usage: ci/verify.sh <downloads dir> <output dir>}"

apks=("$downloads"/*/*.apk)
[ "${#apks[@]}" -eq "$(wc -w <<<"$OPEN_GRIND_BOXES")" ] \
	|| { echo "expected one APK per box ($OPEN_GRIND_BOXES), got ${#apks[@]}" >&2; exit 1; }
sha256sum "${apks[@]}"
for apk in "${apks[@]:1}"; do
	cmp "${apks[0]}" "$apk"
done
mkdir -p "$out"
cp "${apks[0]}" "$out/open-grind-unsigned.apk"
