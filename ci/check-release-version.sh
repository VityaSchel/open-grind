#!/bin/sh
set -eu

. ci/version.sh

tauri=$(json_version src-tauri/tauri.conf.json)
package=$(json_version package.json)
cargo=$(toml_version src-tauri/Cargo.toml)

if [ -z "$tauri" ] || [ "$package" != "$tauri" ] || [ "$cargo" != "$tauri" ]; then
	echo "version mismatch: tauri.conf.json '$tauri', package.json '$package', Cargo.toml '$cargo'" >&2
	exit 1
fi

case "$tauri" in
*-dev*)
	if [ "${ALLOW_DEV:-}" != true ]; then
		echo "refusing to build development version $tauri, set the release version first or re-run with allow_dev" >&2
		exit 1
	fi
	echo "building development version $tauri, this artifact must never be released"
	;;
*)
	news=$(sed -n '1s/^open-grind (\([^)]*\)).*/\1/p' ci/linux/NEWS.Debian)
	if [ "$news" != "$(deb_version "$tauri")" ]; then
		echo "ci/linux/NEWS.Debian starts with '$news', add an entry for $(deb_version "$tauri") first" >&2
		exit 1
	fi
	echo "building release version $tauri"
	;;
esac
