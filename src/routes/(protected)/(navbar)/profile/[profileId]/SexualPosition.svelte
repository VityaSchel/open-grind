<script lang="ts">
	import {
		ArrowDownIcon,
		ArrowDownRightIcon,
		ArrowsDownUpIcon,
		ArrowsLeftRightIcon,
		ArrowUpIcon,
		ArrowUpRightIcon,
	} from "phosphor-svelte";

	import { SexualPosition, sexualPositions } from "$lib/model/users/profiles";
	import { labelFromMap } from "$lib/util/options";

	let { sexualPosition }: { sexualPosition: number } = $props();

	const label = $derived(
		labelFromMap({ labels: sexualPositions, id: sexualPosition }),
	);
</script>

{#if label !== undefined}
	<span class="flex items-center gap-1 whitespace-nowrap *:shrink-0">
		{#if sexualPosition === SexualPosition.Top}
			<ArrowUpIcon class="shrink-0" />
		{:else if sexualPosition === SexualPosition.VersTop}
			<ArrowUpRightIcon class="shrink-0" />
		{:else if sexualPosition === SexualPosition.Versatile}
			<ArrowsDownUpIcon class="shrink-0" />
		{:else if sexualPosition === SexualPosition.VersBottom}
			<ArrowDownRightIcon class="shrink-0" />
		{:else if sexualPosition === SexualPosition.Bottom}
			<ArrowDownIcon class="shrink-0" />
		{:else if sexualPosition === SexualPosition.Side}
			<ArrowsLeftRightIcon class="shrink-0" />
		{/if}
		{label}
	</span>
{/if}
