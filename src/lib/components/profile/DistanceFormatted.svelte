<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { formatDistance } from "$lib/util/units";

	let { distance }: { distance: number } = $props();

	const units = $derived(preferencesSnapshot().units);
</script>

{formatDistance(distance, units)}
