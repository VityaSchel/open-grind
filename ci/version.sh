# shellcheck shell=sh
json_version() { sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' "$1" | head -1; }
toml_version() { sed -n 's/^version = "\([^"]*\)".*/\1/p' "$1" | head -1; }
