trim() {
	local v="$1"
	v="${v#"${v%%[![:space:]]*}"}"
	v="${v%"${v##*[![:space:]]}"}"
	printf '%s' "$v"
}

load_forgejo_variables() {
	local json name value
	json="$(curl -fsSL -H "Authorization: token $OPEN_GRIND_FORGEJO_TOKEN" \
		"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/variables?limit=50")" \
		|| { echo "warning: could not read repo variables, using config.env defaults" >&2; return 0; }
	while IFS== read -r name value; do
		[[ "$name" == OPEN_GRIND_* ]] || continue
		[ -z "${!name:-}" ] || continue
		export "$name=$value"
	done < <(jq -r '.[]? | "\(.name)=\(.data)"' <<<"$json")
}

forgejo_register_ephemeral() {
	curl -fsSL -X POST -H "Authorization: token $OPEN_GRIND_FORGEJO_TOKEN" -H "Content-Type: application/json" \
		-d "$(jq -nc --arg n "$1" '{name:$n,ephemeral:true}')" \
		"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners"
}

render_cloud_init() {
	printf "#!/bin/bash\nFORGEJO_URL='%s'\nRUNNER_UUID='%s'\nRUNNER_TOKEN='%s'\nRUNNER_LABEL='open-grind-builder-%s'\n" \
		"$FORGEJO_SERVER_URL" "$2" "$3" "$1"
	cat "$here/builder.sh"
}

pick_cherry_region() {
	local json r qty
	json="$(curl -fsSL -H "Authorization: Bearer $TF_VAR_cherry_api_token" https://api.cherryservers.com/v1/plans)" || return 1
	for r in $2; do
		qty="$(jq -r --arg p "$1" --arg r "$r" \
			'.[] | select(.slug==$p) | .available_regions[] | select(.slug==$r) | .stock_qty' <<<"$json")"
		[ -n "$qty" ] && [ "$qty" -gt 0 ] 2>/dev/null && { echo "$r"; return 0; }
	done
	return 1
}

pick_vultr_region() {
	local r
	for r in $2; do
		curl -fsSL -H "Authorization: Bearer $TF_VAR_vultr_api_key" \
			"https://api.vultr.com/v2/regions/$r/availability?type=${1%%-*}" \
			| jq -e --arg p "$1" '.available_plans | index($p)' >/dev/null 2>&1 && { echo "$r"; return 0; }
	done
	return 1
}

pick_hetzner() {
	local plan json loc
	for plan in $1; do
		json="$(curl -fsSL -H "Authorization: Bearer $TF_VAR_hetzner_api_token" \
			"https://api.hetzner.cloud/v1/server_types?name=$plan")" || return 1
		for loc in $2; do
			jq -e --arg l "$loc" \
				'.server_types[0].locations[] | select(.name==$l) | .available' <<<"$json" >/dev/null 2>&1 \
				&& { echo "$plan $loc"; return 0; }
		done
	done
	return 1
}

pick_scaleway_zone() {
	local zone avail
	for zone in $2; do
		avail="$(curl -fsSL \
			"https://api.scaleway.com/instance/v1/zones/$zone/products/servers/availability?per_page=100" \
			| jq -r --arg p "$1" '.servers[$p].availability // empty')" || continue
		case "$avail" in available | scarce) echo "$zone"; return 0 ;; esac
	done
	return 1
}

pick_digitalocean_region() {
	local json r
	json="$(curl -fsSL -H "Authorization: Bearer $TF_VAR_digitalocean_token" \
		"https://api.digitalocean.com/v2/sizes?per_page=200")" || return 1
	for r in $2; do
		jq -e --arg s "$1" --arg r "$r" \
			'.sizes[] | select(.slug == $s and .available and (.regions | index($r)))' <<<"$json" >/dev/null 2>&1 \
			&& { echo "$r"; return 0; }
	done
	return 1
}
