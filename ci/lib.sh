verify_image_matches_ref() {
	local sha path remote
	while read -r sha path; do
		remote="$(curl -fsSL -H "Authorization: token $FORGEJO_TOKEN" \
			"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/contents/ci/$path?ref=$FORGEJO_REF_NAME" \
			| jq -r .sha)" || remote=""
		[ "$remote" = "$sha" ] || {
			echo "orchestrator image is stale for ci/$path, rebuild and re-register it" >&2
			return 1
		}
	done <"$1"
}

forgejo_register_ephemeral() {
	curl -fsSL -X POST -H "Authorization: token $FORGEJO_TOKEN" -H "Content-Type: application/json" \
		-d "$(jq -nc --arg n "$1" '{name:$n,ephemeral:true}')" \
		"$FORGEJO_SERVER_URL/api/v1/repos/$FORGEJO_REPOSITORY/actions/runners"
}

register_runners() {
	local a b
	a="$(forgejo_register_ephemeral open-grind-builder-a)"
	b="$(forgejo_register_ephemeral open-grind-builder-b)"
	TF_VAR_runners="$(jq -nc --argjson a "$a" --argjson b "$b" \
		'{a:{uuid:$a.uuid,token:$a.token},b:{uuid:$b.uuid,token:$b.token}}')"
	export TF_VAR_runners
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
			"https://api.vultr.com/v2/regions/$r/availability?type=vbm" \
			| jq -e --arg p "$1" '.available_plans | index($p)' >/dev/null 2>&1 && { echo "$r"; return 0; }
	done
	return 1
}
