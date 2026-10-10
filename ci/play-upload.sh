#!/bin/sh
set -eu

bundle="${1:?usage: ci/play-upload.sh <signed.aab>}"
root="$(cd "$(dirname "$0")/.." && pwd)"

"$root/ci/play-metadata.sh" >/dev/null

exec fastlane supply \
	--package_name org.opengrind \
	--track internal \
	--aab "$bundle" \
	--metadata_path "$root/build/play-metadata/android" \
	--sync_image_upload true
