#!/usr/bin/env bash
set -euo pipefail
: "${CHERRY_API_TOKEN:?}" "${VULTR_API_KEY:?}" "${CHERRY_PROJECT_ID:?}"

cherry_ids() {
	curl -fsSL -H "Authorization: Bearer $CHERRY_API_TOKEN" \
		"https://api.cherryservers.com/v1/projects/$CHERRY_PROJECT_ID/servers" \
		| jq -r '.[] | select(.hostname | startswith("open-grind-builder-")) | .id'
}
vultr_ids() {
	curl -fsSL -H "Authorization: Bearer $VULTR_API_KEY" "https://api.vultr.com/v2/bare-metals" \
		| jq -r '.bare_metals[]? | select(.label | startswith("open-grind-builder-")) | .id'
}

if [ -n "${FORGEJO_TOKEN:-}" ]; then
	runners="$(curl -fsSL -H "Authorization: token $FORGEJO_TOKEN" \
		"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners" \
		| jq -r '(.runners // .)[]? | select(.name | startswith("open-grind-builder-")) | .id')"
	for id in $runners; do
		echo "deleting runner record $id"
		curl -fsS -X DELETE -H "Authorization: token $FORGEJO_TOKEN" \
			"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners/$id" || true
	done
fi

for _ in 1 2 3 4 5; do
	cherry="$(cherry_ids)"
	vultr="$(vultr_ids)"
	[ -z "$cherry$vultr" ] && exit 0
	for id in $cherry; do
		echo "deleting cherry server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $CHERRY_API_TOKEN" \
			"https://api.cherryservers.com/v1/servers/$id" || true
	done
	for id in $vultr; do
		echo "deleting vultr server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $VULTR_API_KEY" \
			"https://api.vultr.com/v2/bare-metals/$id" || true
	done
	sleep 60
done
echo "builder servers still present after retries" >&2
exit 1
