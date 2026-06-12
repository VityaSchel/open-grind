<script lang="ts">
	import { RulerIcon } from "phosphor-svelte";

	import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
	import { Separator } from "$lib/components/ui/separator";
	import { type BodyTypeId, bodyTypes } from "$lib/model/profile";
	import { formatHeight, formatWeightGrams } from "$lib/units";

	let {
		height,
		weight,
		bodyType,
	}: {
		height: number | null;
		weight: number | null;
		bodyType: BodyTypeId | null;
	} = $props();

	const units = $derived(getUnitsSnapshot());
</script>

{#if height !== null || weight !== null || bodyType !== null}
	<span class="flex items-center gap-1 leading-3 whitespace-nowrap">
		<RulerIcon class="rotate-y-180 shrink-0" />
		{#if height !== null}
			{formatHeight(height, units)}
		{/if}
		{#if height !== null && weight !== null}
			<Separator orientation="vertical" />
		{/if}
		{#if weight !== null}
			{formatWeightGrams(weight, units)}
		{/if}
		{#if (height !== null || weight !== null) && bodyType !== null}
			<Separator orientation="vertical" />
		{/if}
		{#if bodyType !== null}
			{bodyTypes[bodyType]}
		{/if}
	</span>
{/if}
