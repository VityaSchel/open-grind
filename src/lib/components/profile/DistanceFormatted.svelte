<script lang="ts">
	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { formatDistance } from "$lib/util/units";

	let { distance }: { distance: number } = $props();

	const units = $derived(getPreferencesSnapshot().units);
</script>

{formatDistance(distance, units)}
