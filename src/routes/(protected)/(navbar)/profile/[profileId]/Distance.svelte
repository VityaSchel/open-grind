<script lang="ts">
	import { NavigationArrowIcon } from "phosphor-svelte";

	import DistanceFormatted from "$lib/components/profile/DistanceFormatted.svelte";

	let { distance }: { distance: number | null } = $props();
</script>

{#if distance !== null}
	<span class="flex items-center gap-1 whitespace-nowrap">
		<NavigationArrowIcon weight="fill" class="shrink-0 rotate-y-180" />
		<DistanceFormatted {distance} />
	</span>
{/if}
