#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lib.sh"

: "${OPEN_GRIND_FORGEJO_TOKEN:?}"
# : "${OPEN_GRIND_CHERRY_API_TOKEN:?}" "${OPEN_GRIND_VULTR_API_KEY:?}" "${OPEN_GRIND_CHERRY_PROJECT_ID:?}"
: "${OPEN_GRIND_HETZNER_API_TOKEN:?}"
# : "${OPEN_GRIND_DIGITALOCEAN_TOKEN:?}"
# : "${OPEN_GRIND_SCALEWAY_ACCESS_KEY:?}" "${OPEN_GRIND_SCALEWAY_SECRET_KEY:?}" "${OPEN_GRIND_SCALEWAY_PROJECT_ID:?}"

OPEN_GRIND_FORGEJO_TOKEN="$(trim "$OPEN_GRIND_FORGEJO_TOKEN")"
# OPEN_GRIND_CHERRY_API_TOKEN="$(trim "$OPEN_GRIND_CHERRY_API_TOKEN")" # with box a enabled
# OPEN_GRIND_VULTR_API_KEY="$(trim "$OPEN_GRIND_VULTR_API_KEY")" # with box b enabled
OPEN_GRIND_HETZNER_API_TOKEN="$(trim "$OPEN_GRIND_HETZNER_API_TOKEN")"
# OPEN_GRIND_DIGITALOCEAN_TOKEN="$(trim "$OPEN_GRIND_DIGITALOCEAN_TOKEN")" # with box e enabled
# OPEN_GRIND_SCALEWAY_ACCESS_KEY="$(trim "$OPEN_GRIND_SCALEWAY_ACCESS_KEY")" # with box d enabled
# OPEN_GRIND_SCALEWAY_SECRET_KEY="$(trim "$OPEN_GRIND_SCALEWAY_SECRET_KEY")" # with box d enabled
# OPEN_GRIND_SCALEWAY_PROJECT_ID="$(trim "$OPEN_GRIND_SCALEWAY_PROJECT_ID")" # with box d enabled

verify_image_matches_ref "$here/manifest"

# export TF_VAR_cherry_api_token="$OPEN_GRIND_CHERRY_API_TOKEN" TF_VAR_vultr_api_key="$OPEN_GRIND_VULTR_API_KEY"
export TF_VAR_hetzner_api_token="$OPEN_GRIND_HETZNER_API_TOKEN"
# export TF_VAR_digitalocean_token="$OPEN_GRIND_DIGITALOCEAN_TOKEN"
# export TF_VAR_scaleway_access_key="$OPEN_GRIND_SCALEWAY_ACCESS_KEY" TF_VAR_scaleway_secret_key="$OPEN_GRIND_SCALEWAY_SECRET_KEY"
# export TF_VAR_scaleway_project_id="$OPEN_GRIND_SCALEWAY_PROJECT_ID"
export TF_VAR_forgejo_url="$FORGEJO_SERVER_URL"
# export TF_VAR_cherry_project_id="$OPEN_GRIND_CHERRY_PROJECT_ID"
# export TF_VAR_cherry_ssh_key_ids="${OPEN_GRIND_CHERRY_SSH_KEY_IDS:-[]}" TF_VAR_vultr_ssh_key_ids="${OPEN_GRIND_VULTR_SSH_KEY_IDS:-[]}"
export TF_VAR_hetzner_ssh_key_ids="${OPEN_GRIND_HETZNER_SSH_KEY_IDS:-[]}"
# export TF_VAR_digitalocean_ssh_key_ids="${OPEN_GRIND_DIGITALOCEAN_SSH_KEY_IDS:-[]}"
# export TF_VAR_cherry_plan="${OPEN_GRIND_CHERRY_PLAN:-G1-8-32gb-200nv-ded}"
# export TF_VAR_vultr_plan="${OPEN_GRIND_VULTR_PLAN:-vhp-8c-16gb-amd}"
# export TF_VAR_scaleway_plan="${OPEN_GRIND_SCALEWAY_PLAN:-PRO2-S}"
# export TF_VAR_digitalocean_size="${OPEN_GRIND_DIGITALOCEAN_SIZE:-s-8vcpu-16gb}"

# TF_VAR_cherry_region="$(pick_cherry_region "$TF_VAR_cherry_plan" \
# 	"${OPEN_GRIND_CHERRY_REGIONS:-LT-Siauliai NL-Amsterdam US-Chicago SG-Singapore}")" \
# 	|| { echo "no cherry stock for $TF_VAR_cherry_plan" >&2; exit 1; }
# export TF_VAR_cherry_region
# echo "box a: cherry $TF_VAR_cherry_region"

# TF_VAR_vultr_region="$(pick_vultr_region "$TF_VAR_vultr_plan" \
# 	"${OPEN_GRIND_VULTR_REGIONS:-ams fra cdg waw mad ewr ord dfw sjc lax mia sgp}")" \
# 	|| { echo "no vultr stock for $TF_VAR_vultr_plan" >&2; exit 1; }
# export TF_VAR_vultr_region
# echo "box b: vultr $TF_VAR_vultr_region"

read -r TF_VAR_hetzner_plan TF_VAR_hetzner_location < <(pick_hetzner \
	"${OPEN_GRIND_HETZNER_PLANS:-cx43 cpx42}" "${OPEN_GRIND_HETZNER_LOCATIONS:-fsn1 nbg1 hel1}") \
	|| { echo "no hetzner stock for any of ${OPEN_GRIND_HETZNER_PLANS:-cx43 cpx42}" >&2; exit 1; }
export TF_VAR_hetzner_plan TF_VAR_hetzner_location
echo "box c: hetzner $TF_VAR_hetzner_plan $TF_VAR_hetzner_location"

# TF_VAR_scaleway_zone="$(pick_scaleway_zone "$TF_VAR_scaleway_plan" \
# 	"${OPEN_GRIND_SCALEWAY_ZONES:-fr-par-1 fr-par-2 nl-ams-1 nl-ams-2 pl-waw-1 pl-waw-2}")" \
# 	|| { echo "no scaleway stock for $TF_VAR_scaleway_plan" >&2; exit 1; }
# export TF_VAR_scaleway_zone
# echo "box d: scaleway $TF_VAR_scaleway_zone"

# TF_VAR_digitalocean_region="$(pick_digitalocean_region "$TF_VAR_digitalocean_size" \
# 	"${OPEN_GRIND_DIGITALOCEAN_REGIONS:-fra1 ams3 lon1}")" \
# 	|| { echo "no digitalocean stock for $TF_VAR_digitalocean_size" >&2; exit 1; }
# export TF_VAR_digitalocean_region
# echo "box e: digitalocean $TF_VAR_digitalocean_region"

register_runners

terraform -chdir="$here/terraform" init -input=false >/dev/null
terraform -chdir="$here/terraform" apply -auto-approve -input=false
