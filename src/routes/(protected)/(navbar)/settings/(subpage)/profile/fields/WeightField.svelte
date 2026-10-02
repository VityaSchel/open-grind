<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { kgToPounds, poundsToKg } from "$lib/util/units";
	import { weightKgRange, weightPoundRange } from "../options";
	import NumberField from "./NumberField.svelte";

	let { value = $bindable() }: { value: number | null } = $props();

	const units = $derived(preferencesSnapshot().units);
	const pounds = $derived(value === null ? null : kgToPounds(value));

	let kgBeforeEditing: number | null = null;

	function storePounds(typed: number | null) {
		if (typed === pounds) return;
		if (typed === null) {
			value = null;
			return;
		}
		const retypedAsShown =
			kgBeforeEditing !== null && typed === kgToPounds(kgBeforeEditing);
		value = retypedAsShown
			? kgBeforeEditing
			: Math.min(
					weightKgRange.max,
					Math.max(weightKgRange.min, poundsToKg(typed)),
				);
	}
</script>

{#if units === "imperial"}
	<NumberField
		label="Weight"
		bind:value={() => pounds, storePounds}
		min={weightPoundRange.min}
		max={weightPoundRange.max}
		unit="lb"
		placeholder="—"
		onfocus={() => (kgBeforeEditing = value)}
	/>
{:else}
	<NumberField
		label="Weight"
		bind:value
		min={weightKgRange.min}
		max={weightKgRange.max}
		step={0.5}
		unit="kg"
		placeholder="—"
	/>
{/if}
