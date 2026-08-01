<script lang="ts">
	import { RulerIcon } from "phosphor-svelte";

	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { Separator } from "$lib/components/ui/separator";
	import { type BodyTypeId, bodyTypes } from "$lib/model/users/profiles";
	import { formatHeight, formatWeightGrams } from "$lib/util/units";

	let {
		height,
		weight,
		bodyType,
	}: {
		height: number | null;
		weight: number | null;
		bodyType: BodyTypeId | null;
	} = $props();

	const units = $derived(getPreferencesSnapshot().units);
</script>

{#if height !== null || weight !== null || bodyType !== null}
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
		{#if (height !== null || weight !== null) && bodyType !== null}
			<Separator orientation="vertical" />
		{/if}
		{#if bodyType !== null}
			{bodyTypes[bodyType]}
		{/if}
	</span>
{/if}
