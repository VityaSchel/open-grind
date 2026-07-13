#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lib.sh"

: "${FORGEJO_TOKEN:?}" "${CHERRY_API_TOKEN:?}" "${VULTR_API_KEY:?}" "${CHERRY_PROJECT_ID:?}"

verify_image_matches_ref "$here/manifest"

export TF_VAR_cherry_api_token="$CHERRY_API_TOKEN" TF_VAR_vultr_api_key="$VULTR_API_KEY"
export TF_VAR_forgejo_url="$FORGEJO_SERVER_URL" TF_VAR_cherry_project_id="$CHERRY_PROJECT_ID"
export TF_VAR_cherry_ssh_key_ids="${CHERRY_SSH_KEY_IDS:-[]}" TF_VAR_vultr_ssh_key_ids="${VULTR_SSH_KEY_IDS:-[]}"
export TF_VAR_cherry_plan="${OPEN_GRIND_CHERRY_PLAN:-G1-8-32gb-200nv-ded}"
export TF_VAR_vultr_plan="${OPEN_GRIND_VULTR_PLAN:-vhp-8c-16gb-amd}"

TF_VAR_cherry_region="$(pick_cherry_region "$TF_VAR_cherry_plan" \
	"${OPEN_GRIND_CHERRY_REGIONS:-LT-Siauliai NL-Amsterdam US-Chicago SG-Singapore}")" \
	|| { echo "no cherry stock for $TF_VAR_cherry_plan" >&2; exit 1; }
export TF_VAR_cherry_region
echo "box a: cherry $TF_VAR_cherry_region"

TF_VAR_vultr_region="$(pick_vultr_region "$TF_VAR_vultr_plan" \
	"${OPEN_GRIND_VULTR_REGIONS:-ams fra cdg waw mad ewr ord dfw sjc lax mia sgp}")" \
	|| { echo "no vultr stock for $TF_VAR_vultr_plan" >&2; exit 1; }
export TF_VAR_vultr_region
echo "box b: vultr $TF_VAR_vultr_region"

register_runners

terraform -chdir="$here/terraform" init -input=false >/dev/null
terraform -chdir="$here/terraform" apply -auto-approve -input=false
