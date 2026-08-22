#!/usr/bin/env bash
# Mirror of the keystore shim in flake.nix's build-android script, for
# `tauri android dev`. If OPEN_GRIND_KEYSTORE_PROPERTIES points at a
# properties file, copy it into the gradle project so the signingConfig
# picks it up; remove it again when this script exits.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYSTORE_DEST="$ROOT/src-tauri/gen/android/keystore.properties"

if [ -n "${OPEN_GRIND_KEYSTORE_PROPERTIES:-}" ]; then
  cp "$OPEN_GRIND_KEYSTORE_PROPERTIES" "$KEYSTORE_DEST"
  trap 'rm -f "$KEYSTORE_DEST"' EXIT
fi

exec bun run tauri android dev --features devtools "$@"
