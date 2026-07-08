<script lang="ts">
	import z from "zod";

	import * as Command from "$lib/components/ui/command";
	import { commandCenterState } from "../command-center-state.svelte";
	import SetLocationByGeohashCommandItem from "./SetLocationByGeohashCommandItem.svelte";

	const queryGeohash = $derived(commandCenterState.query.substring(1));
	const queryHasValue = $derived(queryGeohash.length > 0);
	const geohash = $derived.by(() => {
		if (!queryHasValue) return null;
		return (
			z
				.string()
				.regex(/^[0-9b-hjkmnp-z]{1,12}$/)
				.safeParse(queryGeohash).data ?? null
		);
	});
</script>

{#if !queryHasValue || geohash !== null}
	<Command.Group heading="Set location by geohash...">
		<SetLocationByGeohashCommandItem {geohash} />
	</Command.Group>
{/if}
