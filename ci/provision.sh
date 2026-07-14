#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/lib.sh"

: "${OPEN_GRIND_FORGEJO_TOKEN:?}"
OPEN_GRIND_FORGEJO_TOKEN="$(trim "$OPEN_GRIND_FORGEJO_TOKEN")"

[ -z "${FORGEJO_SERVER_URL:-}" ] || load_forgejo_variables
source "$here/config.env"

grep -qF "box: [${OPEN_GRIND_BOXES// /, }]" "$here/../.forgejo/workflows/build.yml" \
	|| { echo "build.yml matrix does not match OPEN_GRIND_BOXES '$OPEN_GRIND_BOXES' in ci/config.env" >&2; exit 1; }

prepare_a() {
	: "${OPEN_GRIND_CHERRY_API_TOKEN:?}" "${OPEN_GRIND_CHERRY_PROJECT_ID:?}"
	export TF_VAR_cherry_api_token="$(trim "$OPEN_GRIND_CHERRY_API_TOKEN")"
	export TF_VAR_cherry_project_id="$(trim "$OPEN_GRIND_CHERRY_PROJECT_ID")"
	export TF_VAR_cherry_ssh_key_ids="${OPEN_GRIND_CHERRY_SSH_KEY_IDS:-[]}"
	export TF_VAR_cherry_plan="$OPEN_GRIND_CHERRY_PLAN"
	TF_VAR_cherry_region="$(pick_cherry_region "$OPEN_GRIND_CHERRY_PLAN" "$OPEN_GRIND_CHERRY_REGIONS")" \
		|| { echo "no cherry stock for $OPEN_GRIND_CHERRY_PLAN" >&2; return 1; }
	export TF_VAR_cherry_region
	echo "box a: cherry $OPEN_GRIND_CHERRY_PLAN $TF_VAR_cherry_region"
}

prepare_b() {
	: "${OPEN_GRIND_VULTR_API_KEY:?}"
	export TF_VAR_vultr_api_key="$(trim "$OPEN_GRIND_VULTR_API_KEY")"
	export TF_VAR_vultr_ssh_key_ids="${OPEN_GRIND_VULTR_SSH_KEY_IDS:-[]}"
	export TF_VAR_vultr_plan="$OPEN_GRIND_VULTR_PLAN"
	TF_VAR_vultr_region="$(pick_vultr_region "$OPEN_GRIND_VULTR_PLAN" "$OPEN_GRIND_VULTR_REGIONS")" \
		|| { echo "no vultr stock for $OPEN_GRIND_VULTR_PLAN" >&2; return 1; }
	export TF_VAR_vultr_region
	echo "box b: vultr $OPEN_GRIND_VULTR_PLAN $TF_VAR_vultr_region"
}

prepare_c() {
	: "${OPEN_GRIND_HETZNER_API_TOKEN:?}"
	export TF_VAR_hetzner_api_token="$(trim "$OPEN_GRIND_HETZNER_API_TOKEN")"
	export TF_VAR_hetzner_ssh_key_ids="${OPEN_GRIND_HETZNER_SSH_KEY_IDS:-[]}"
	read -r TF_VAR_hetzner_plan TF_VAR_hetzner_location \
		< <(pick_hetzner "$OPEN_GRIND_HETZNER_PLANS" "$OPEN_GRIND_HETZNER_LOCATIONS") \
		|| { echo "no hetzner stock for any of $OPEN_GRIND_HETZNER_PLANS" >&2; return 1; }
	export TF_VAR_hetzner_plan TF_VAR_hetzner_location
	echo "box c: hetzner $TF_VAR_hetzner_plan $TF_VAR_hetzner_location"
}

prepare_d() {
	: "${OPEN_GRIND_SCALEWAY_ACCESS_KEY:?}" "${OPEN_GRIND_SCALEWAY_SECRET_KEY:?}" "${OPEN_GRIND_SCALEWAY_PROJECT_ID:?}"
	export TF_VAR_scaleway_access_key="$(trim "$OPEN_GRIND_SCALEWAY_ACCESS_KEY")"
	export TF_VAR_scaleway_secret_key="$(trim "$OPEN_GRIND_SCALEWAY_SECRET_KEY")"
	export TF_VAR_scaleway_project_id="$(trim "$OPEN_GRIND_SCALEWAY_PROJECT_ID")"
	export TF_VAR_scaleway_plan="$OPEN_GRIND_SCALEWAY_PLAN"
	TF_VAR_scaleway_zone="$(pick_scaleway_zone "$OPEN_GRIND_SCALEWAY_PLAN" "$OPEN_GRIND_SCALEWAY_ZONES")" \
		|| { echo "no scaleway stock for $OPEN_GRIND_SCALEWAY_PLAN" >&2; return 1; }
	export TF_VAR_scaleway_zone
	echo "box d: scaleway $OPEN_GRIND_SCALEWAY_PLAN $TF_VAR_scaleway_zone"
}

prepare_e() {
	: "${OPEN_GRIND_DIGITALOCEAN_TOKEN:?}"
	export TF_VAR_digitalocean_token="$(trim "$OPEN_GRIND_DIGITALOCEAN_TOKEN")"
	export TF_VAR_digitalocean_ssh_key_ids="${OPEN_GRIND_DIGITALOCEAN_SSH_KEY_IDS:-[]}"
	export TF_VAR_digitalocean_size="$OPEN_GRIND_DIGITALOCEAN_SIZE"
	TF_VAR_digitalocean_region="$(pick_digitalocean_region "$OPEN_GRIND_DIGITALOCEAN_SIZE" "$OPEN_GRIND_DIGITALOCEAN_REGIONS")" \
		|| { echo "no digitalocean stock for $OPEN_GRIND_DIGITALOCEAN_SIZE" >&2; return 1; }
	export TF_VAR_digitalocean_region
	echo "box e: digitalocean $OPEN_GRIND_DIGITALOCEAN_SIZE $TF_VAR_digitalocean_region"
}

provision_box() {
	local reg
	reg="$(forgejo_register_ephemeral "open-grind-builder-$1")"
	TF_VAR_user_data="$(render_cloud_init "$1" "$(jq -r .uuid <<<"$reg")" "$(jq -r .token <<<"$reg")")"
	export TF_VAR_user_data
	terraform -chdir="$here/terraform/boxes/$1" init -input=false >/dev/null
	terraform -chdir="$here/terraform/boxes/$1" apply -auto-approve -input=false
}

for box in $OPEN_GRIND_BOXES; do
	"prepare_$box"
	provision_box "$box"
done
