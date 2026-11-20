#!/usr/bin/env bash

set -euo pipefail

features=devtools
if [ "${OPEN_GRIND_DEMO:-}" = 1 ]; then
	features=devtools,demo
fi

if [ "$#" -eq 0 ] && [ -n "${OG_SIMULATOR:-}" ]; then
	set -- "$OG_SIMULATOR"
fi

exec env -u DEVELOPER_DIR -u SDKROOT -u PUBLIC_TEST_INSETS \
	bun run tauri ios dev "$@" --features "$features"
