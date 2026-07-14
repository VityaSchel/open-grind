#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lib.sh"
source "$here/config.env"

scaleway_zones="fr-par-1 fr-par-2 fr-par-3 nl-ams-1 nl-ams-2 nl-ams-3 pl-waw-1 pl-waw-2 pl-waw-3"

reap_a() {
	: "${OPEN_GRIND_CHERRY_API_TOKEN:?}" "${OPEN_GRIND_CHERRY_PROJECT_ID:?}"
	local token ids id
	token="$(trim "$OPEN_GRIND_CHERRY_API_TOKEN")"
	ids="$(curl -fsSL -H "Authorization: Bearer $token" \
		"https://api.cherryservers.com/v1/projects/$(trim "$OPEN_GRIND_CHERRY_PROJECT_ID")/servers" \
		| jq -r '.[] | select(.hostname | startswith("open-grind-builder-")) | .id')"
	[ -n "$ids" ] || return 0
	for id in $ids; do
		echo "deleting cherry server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $token" \
			"https://api.cherryservers.com/v1/servers/$id" || true
	done
	return 1
}

reap_b() {
	: "${OPEN_GRIND_VULTR_API_KEY:?}"
	local token ids id
	token="$(trim "$OPEN_GRIND_VULTR_API_KEY")"
	ids="$(curl -fsSL -H "Authorization: Bearer $token" "https://api.vultr.com/v2/instances" \
		| jq -r '.instances[]? | select(.label | startswith("open-grind-builder-")) | .id')"
	[ -n "$ids" ] || return 0
	for id in $ids; do
		echo "deleting vultr server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $token" \
			"https://api.vultr.com/v2/instances/$id" || true
	done
	return 1
}

reap_c() {
	: "${OPEN_GRIND_HETZNER_API_TOKEN:?}"
	local token ids ips id
	token="$(trim "$OPEN_GRIND_HETZNER_API_TOKEN")"
	ids="$(curl -fsSL -H "Authorization: Bearer $token" "https://api.hetzner.cloud/v1/servers" \
		| jq -r '.servers[]? | select(.name | startswith("open-grind-builder-")) | .id')"
	ips="$(curl -fsSL -H "Authorization: Bearer $token" "https://api.hetzner.cloud/v1/primary_ips" \
		| jq -r '.primary_ips[]? | select(.assignee_id == null) | .id')"
	[ -n "$ids$ips" ] || return 0
	for id in $ids; do
		echo "deleting hetzner server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $token" \
			"https://api.hetzner.cloud/v1/servers/$id" >/dev/null || true
	done
	for id in $ips; do
		echo "deleting hetzner primary ip $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $token" \
			"https://api.hetzner.cloud/v1/primary_ips/$id" || true
	done
	return 1
}

reap_d() {
	: "${OPEN_GRIND_SCALEWAY_SECRET_KEY:?}" "${OPEN_GRIND_SCALEWAY_PROJECT_ID:?}"
	local token project zone id servers volumes
	token="$(trim "$OPEN_GRIND_SCALEWAY_SECRET_KEY")"
	project="$(trim "$OPEN_GRIND_SCALEWAY_PROJECT_ID")"
	servers="$(for zone in $scaleway_zones; do
		curl -fsSL -H "X-Auth-Token: $token" \
			"https://api.scaleway.com/instance/v1/zones/$zone/servers?project=$project&name=open-grind-builder-" \
			| jq -r --arg z "$zone" \
				'.servers[]? | select(.name | startswith("open-grind-builder-")) | "\($z) \(.id)"'
	done)"
	volumes="$(for zone in $scaleway_zones; do
		curl -fsSL -H "X-Auth-Token: $token" \
			"https://api.scaleway.com/block/v1/zones/$zone/volumes?project_id=$project" \
			| jq -r --arg z "$zone" '.volumes[]? | select(.status == "available") | "\($z) \(.id)"'
	done)"
	[ -n "$servers$volumes" ] || return 0
	while read -r zone id; do
		[ -n "$id" ] || continue
		echo "terminating scaleway server $id in $zone"
		curl -fsS -X POST -H "X-Auth-Token: $token" -H "Content-Type: application/json" \
			-d '{"action":"terminate"}' \
			"https://api.scaleway.com/instance/v1/zones/$zone/servers/$id/action" >/dev/null || true
	done <<<"$servers"
	while read -r zone id; do
		[ -n "$id" ] || continue
		echo "deleting scaleway volume $id in $zone"
		curl -fsS -X DELETE -H "X-Auth-Token: $token" \
			"https://api.scaleway.com/block/v1/zones/$zone/volumes/$id" || true
	done <<<"$volumes"
	return 1
}

reap_e() {
	: "${OPEN_GRIND_DIGITALOCEAN_TOKEN:?}"
	local token ids id
	token="$(trim "$OPEN_GRIND_DIGITALOCEAN_TOKEN")"
	ids="$(curl -fsSL -H "Authorization: Bearer $token" \
		"https://api.digitalocean.com/v2/droplets?per_page=200" \
		| jq -r '.droplets[]? | select(.name | startswith("open-grind-builder-")) | .id')"
	[ -n "$ids" ] || return 0
	for id in $ids; do
		echo "deleting digitalocean droplet $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $token" \
			"https://api.digitalocean.com/v2/droplets/$id" || true
	done
	return 1
}

if [ -n "${OPEN_GRIND_FORGEJO_TOKEN:-}" ] && [ -n "${FORGEJO_SERVER_URL:-}" ]; then
	OPEN_GRIND_FORGEJO_TOKEN="$(trim "$OPEN_GRIND_FORGEJO_TOKEN")"
	runners="$(curl -fsSL -H "Authorization: token $OPEN_GRIND_FORGEJO_TOKEN" \
		"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners" \
		| jq -r '(.runners? // .)[]? | select(.name | startswith("open-grind-builder-")) | .id')" \
		|| runners=""
	for id in $runners; do
		echo "deleting runner record $id"
		curl -fsS -X DELETE -H "Authorization: token $OPEN_GRIND_FORGEJO_TOKEN" \
			"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners/$id" || true
	done
fi

for _ in 1 2 3 4 5; do
	leftover=0
	for box in $OPEN_GRIND_BOXES; do
		"reap_$box" || leftover=1
	done
	[ "$leftover" -eq 0 ] && exit 0
	sleep 60
done
echo "builder resources still present after retries" >&2
exit 1
