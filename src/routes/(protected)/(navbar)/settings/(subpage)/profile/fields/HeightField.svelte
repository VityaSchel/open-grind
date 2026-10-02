<script lang="ts">
	import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import { cmToInches, inchesToCm } from "$lib/util/units";
	import { heightCmRange, heightInchOptions } from "../options";
	import NumberField from "./NumberField.svelte";
	import SelectField from "./SelectField.svelte";

	let { value = $bindable() }: { value: number | null } = $props();

	const units = $derived(preferencesSnapshot().units);
	const inches = $derived(value === null ? null : cmToInches(value));

	function storeInches(picked: number | null) {
		if (picked === inches) return;
		value =
			picked === null
				? null
				: Math.min(
						heightCmRange.max,
						Math.max(heightCmRange.min, inchesToCm(picked)),
					);
	}
</script>

{#if units === "imperial"}
	<SelectField
		label="Height"
		bind:value={() => inches, storeInches}
		options={heightInchOptions}
	/>
{:else}
	<NumberField
		label="Height"
		bind:value
		min={heightCmRange.min}
		max={heightCmRange.max}
		unit="cm"
		placeholder="—"
	/>
{/if}
