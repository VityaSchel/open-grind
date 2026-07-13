#!/usr/bin/env bash
set -euo pipefail
IN="${1:?usage: ci/sign.sh <unsigned.apk> [out.apk]}"
OUT="${2:-open-grind-signed.apk}"
: "${OPEN_GRIND_KEYSTORE_PROPERTIES:?set OPEN_GRIND_KEYSTORE_PROPERTIES to your keystore.properties}"
for b in apksigner zipalign; do
	command -v "$b" >/dev/null || { echo "$b not found, run inside 'nix develop'" >&2; exit 1; }
done

kv() { grep -E "^$1=" "$OPEN_GRIND_KEYSTORE_PROPERTIES" | tail -1 | cut -d= -f2-; }
store="$(kv storeFile)"
store="${store/#\~/$HOME}"
aligned="${TMPDIR:-/tmp}/open-grind-$$.apk"
trap 'rm -f "$aligned"' EXIT

zipalign -p -f 4 "$IN" "$aligned"
apksigner sign --ks "$store" --ks-key-alias "$(kv keyAlias)" \
	--ks-pass "pass:$(kv password)" --key-pass "pass:$(kv password)" --out "$OUT" "$aligned"
apksigner verify --print-certs "$OUT" | grep -i 'certificate SHA-256' || true
echo "signed: $OUT"
