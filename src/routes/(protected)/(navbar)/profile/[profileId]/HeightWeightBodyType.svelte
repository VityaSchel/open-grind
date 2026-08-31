<script lang="ts">
	import { RulerIcon } from "phosphor-svelte";

	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { Separator } from "$lib/components/ui/separator";
	import { bodyTypes } from "$lib/model/users/profiles";
	import { labelFromMap } from "$lib/util/options";
	import { formatHeight, formatWeightGrams } from "$lib/util/units";

	let {
		height,
		weight,
		bodyType,
	}: {
		height: number | null;
		weight: number | null;
		bodyType: number | null;
	} = $props();

	const units = $derived(getPreferencesSnapshot().units);
	const bodyTypeLabel = $derived(
		bodyType === null
			? undefined
			: labelFromMap({ labels: bodyTypes, id: bodyType }),
	);
</script>

{#if height !== null || weight !== null || bodyTypeLabel !== undefined}
	<span class="flex items-center gap-1 leading-3 whitespace-nowrap">
		<RulerIcon class="shrink-0 rotate-y-180" />
		{#if height !== null}
			{formatHeight(height, units)}
		{/if}
		{#if height !== null && weight !== null}
			<Separator orientation="vertical" />
		{/if}
		{#if weight !== null}
			{formatWeightGrams(weight, units)}
		{/if}
		{#if (height !== null || weight !== null) && bodyTypeLabel !== undefined}
			<Separator orientation="vertical" />
		{/if}
		{#if bodyTypeLabel !== undefined}
			{bodyTypeLabel}
		{/if}
	</span>
{/if}
