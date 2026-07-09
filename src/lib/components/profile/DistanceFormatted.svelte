<script lang="ts">
	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import { formatDistance } from "$lib/util/units";

	let { distance }: { distance: number } = $props();

	const units = $derived(getUnitsSnapshot());
</script>

{formatDistance(distance, units)}
