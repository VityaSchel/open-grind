#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

active="$(curl -fsSL "$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runs" \
	| jq '[.workflow_runs[] | select(.status=="running" or .status=="waiting")] | length')"
if [ "$active" -gt 1 ]; then
	echo "another run is active, skipping"
	exit 0
fi
exec bash "$here/teardown.sh"
