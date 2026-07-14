#!/usr/bin/env bash
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"
# : "${OPEN_GRIND_CHERRY_API_TOKEN:?}" "${OPEN_GRIND_VULTR_API_KEY:?}" "${OPEN_GRIND_CHERRY_PROJECT_ID:?}"
: "${OPEN_GRIND_HETZNER_API_TOKEN:?}" "${OPEN_GRIND_DIGITALOCEAN_TOKEN:?}"
# : "${OPEN_GRIND_SCALEWAY_SECRET_KEY:?}" "${OPEN_GRIND_SCALEWAY_PROJECT_ID:?}"

# OPEN_GRIND_CHERRY_API_TOKEN="$(trim "$OPEN_GRIND_CHERRY_API_TOKEN")" ; OPEN_GRIND_VULTR_API_KEY="$(trim "$OPEN_GRIND_VULTR_API_KEY")" # with boxes a/b enabled
OPEN_GRIND_HETZNER_API_TOKEN="$(trim "$OPEN_GRIND_HETZNER_API_TOKEN")"
OPEN_GRIND_DIGITALOCEAN_TOKEN="$(trim "$OPEN_GRIND_DIGITALOCEAN_TOKEN")"
# OPEN_GRIND_SCALEWAY_SECRET_KEY="$(trim "$OPEN_GRIND_SCALEWAY_SECRET_KEY")" # with box d enabled
# OPEN_GRIND_SCALEWAY_PROJECT_ID="$(trim "$OPEN_GRIND_SCALEWAY_PROJECT_ID")" # with box d enabled

scaleway_zones="fr-par-1 fr-par-2 fr-par-3 nl-ams-1 nl-ams-2 nl-ams-3 pl-waw-1 pl-waw-2 pl-waw-3"

cherry_ids() {
	curl -fsSL -H "Authorization: Bearer $OPEN_GRIND_CHERRY_API_TOKEN" \
		"https://api.cherryservers.com/v1/projects/$OPEN_GRIND_CHERRY_PROJECT_ID/servers" \
		| jq -r '.[] | select(.hostname | startswith("open-grind-builder-")) | .id'
}
vultr_ids() {
	curl -fsSL -H "Authorization: Bearer $OPEN_GRIND_VULTR_API_KEY" "https://api.vultr.com/v2/instances" \
		| jq -r '.instances[]? | select(.label | startswith("open-grind-builder-")) | .id'
}
hetzner_ids() {
	curl -fsSL -H "Authorization: Bearer $OPEN_GRIND_HETZNER_API_TOKEN" "https://api.hetzner.cloud/v1/servers" \
		| jq -r '.servers[]? | select(.name | startswith("open-grind-builder-")) | .id'
}
hetzner_ip_ids() {
	curl -fsSL -H "Authorization: Bearer $OPEN_GRIND_HETZNER_API_TOKEN" "https://api.hetzner.cloud/v1/primary_ips" \
		| jq -r '.primary_ips[]? | select(.assignee_id == null) | .id'
}
scaleway_servers() {
	local zone
	for zone in $scaleway_zones; do
		curl -fsSL -H "X-Auth-Token: $OPEN_GRIND_SCALEWAY_SECRET_KEY" \
			"https://api.scaleway.com/instance/v1/zones/$zone/servers?project=$OPEN_GRIND_SCALEWAY_PROJECT_ID&name=open-grind-builder-" \
			| jq -r --arg z "$zone" \
				'.servers[]? | select(.name | startswith("open-grind-builder-")) | "\($z) \(.id)"'
	done
}
scaleway_volumes() {
	local zone
	for zone in $scaleway_zones; do
		curl -fsSL -H "X-Auth-Token: $OPEN_GRIND_SCALEWAY_SECRET_KEY" \
			"https://api.scaleway.com/block/v1/zones/$zone/volumes?project_id=$OPEN_GRIND_SCALEWAY_PROJECT_ID" \
			| jq -r --arg z "$zone" '.volumes[]? | select(.status == "available") | "\($z) \(.id)"'
	done
}
digitalocean_ids() {
	curl -fsSL -H "Authorization: Bearer $OPEN_GRIND_DIGITALOCEAN_TOKEN" \
		"https://api.digitalocean.com/v2/droplets?per_page=200" \
		| jq -r '.droplets[]? | select(.name | startswith("open-grind-builder-")) | .id'
}

if [ -n "${OPEN_GRIND_FORGEJO_TOKEN:-}" ]; then
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
	cherry="" vultr="" # cherry="$(cherry_ids)" vultr="$(vultr_ids)" with boxes a/b enabled
	scaleway="" scaleway_vols="" # scaleway="$(scaleway_servers)" scaleway_vols="$(scaleway_volumes)" with box d enabled
	hetzner="$(hetzner_ids)"
	hetzner_ips="$(hetzner_ip_ids)"
	digitalocean="$(digitalocean_ids)"
	[ -z "$cherry$vultr$hetzner$hetzner_ips$scaleway$scaleway_vols$digitalocean" ] && exit 0
	for id in $cherry; do
		echo "deleting cherry server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $OPEN_GRIND_CHERRY_API_TOKEN" \
			"https://api.cherryservers.com/v1/servers/$id" || true
	done
	for id in $vultr; do
		echo "deleting vultr server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $OPEN_GRIND_VULTR_API_KEY" \
			"https://api.vultr.com/v2/instances/$id" || true
	done
	for id in $hetzner; do
		echo "deleting hetzner server $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $OPEN_GRIND_HETZNER_API_TOKEN" \
			"https://api.hetzner.cloud/v1/servers/$id" >/dev/null || true
	done
	for id in $hetzner_ips; do
		echo "deleting hetzner primary ip $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $OPEN_GRIND_HETZNER_API_TOKEN" \
			"https://api.hetzner.cloud/v1/primary_ips/$id" || true
	done
	while read -r zone id; do
		[ -n "$id" ] || continue
		echo "terminating scaleway server $id in $zone"
		curl -fsS -X POST -H "X-Auth-Token: $OPEN_GRIND_SCALEWAY_SECRET_KEY" -H "Content-Type: application/json" \
			-d '{"action":"terminate"}' \
			"https://api.scaleway.com/instance/v1/zones/$zone/servers/$id/action" >/dev/null || true
	done <<<"$scaleway"
	while read -r zone id; do
		[ -n "$id" ] || continue
		echo "deleting scaleway volume $id in $zone"
		curl -fsS -X DELETE -H "X-Auth-Token: $OPEN_GRIND_SCALEWAY_SECRET_KEY" \
			"https://api.scaleway.com/block/v1/zones/$zone/volumes/$id" || true
	done <<<"$scaleway_vols"
	for id in $digitalocean; do
		echo "deleting digitalocean droplet $id"
		curl -fsS -X DELETE -H "Authorization: Bearer $OPEN_GRIND_DIGITALOCEAN_TOKEN" \
			"https://api.digitalocean.com/v2/droplets/$id" || true
	done
	sleep 60
done
echo "builder resources still present after retries" >&2
exit 1
