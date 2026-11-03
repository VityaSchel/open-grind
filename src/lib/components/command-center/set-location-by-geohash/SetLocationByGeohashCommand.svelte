<script lang="ts">
	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import * as Command from "#lib/components/ui/command/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { geohashPrefixSchema } from "#lib/model/geohash.ts";
	import { commandCenterState } from "../command-center-state.svelte";
	import SetLocationByGeohashCommandItem from "./SetLocationByGeohashCommandItem.svelte";

	const queryGeohash = $derived(commandCenterState.query.substring(1));
	const queryHasValue = $derived(queryGeohash.length > 0);
	const geohash = $derived.by(() => {
		if (!queryHasValue) return null;
		return geohashPrefixSchema.safeParse(queryGeohash).data ?? null;
	});
	const currentGeohash = $derived(preferencesSnapshot().geohash);
</script>

{#if !queryHasValue || geohash !== null}
	<Command.Group
		heading={t("commands.setLocationByGeohash.heading")}
		value="set-location-by-geohash"
	>
		<SetLocationByGeohashCommandItem {geohash} {currentGeohash} />
	</Command.Group>
{/if}
