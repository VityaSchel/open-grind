# shellcheck shell=sh
json_version() { sed -n 's/^[[:space:]]*"version": "\([^"]*\)".*/\1/p' "$1" | head -1; }
toml_version() { sed -n 's/^version = "\([^"]*\)".*/\1/p' "$1" | head -1; }

# dpkg sorts "-rc.1" above the release (Debian revision) and "~rc.1" below it. The 0.1.0 line
# already shipped "-" prereleases to apt, so 0.1.0 itself needs "+0" to outrank them.
deb_version() {
	case "$1" in
	0.1.0) echo 0.1.0+0 ;;
	0.1.0-*) echo "$1" ;;
	*-*) echo "${1%%-*}~${1#*-}" ;;
	*) echo "$1" ;;
	esac
}
