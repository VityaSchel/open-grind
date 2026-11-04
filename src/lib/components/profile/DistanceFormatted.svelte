<script lang="ts">
	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import { formatDistance } from "#lib/util/units.ts";

	let { distance }: { distance: number } = $props();

	const units = $derived(preferencesSnapshot().units);
</script>

{formatDistance(distance, units)}
