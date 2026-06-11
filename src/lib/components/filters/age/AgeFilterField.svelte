<script lang="ts">
	import { Checkbox } from "$lib/components/ui/checkbox";
	import { Label } from "$lib/components/ui/label";
	import FilterField from "../FilterField.svelte";
	import AgeFilterSlider from "./AgeFilterSlider.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();

	let label = $state("");

	const uid = $props.id();
</script>

<div class="inline-block space-y-3 w-full">
	<FilterField>
		<Checkbox id="filters-age-{uid}" bind:checked />
		<Label for="filters-age-{uid}">Age</Label>
		<span class="ml-auto min-w-0 truncate">
			{label}
		</span>
	</FilterField>
	<div class="ps-7">
		<AgeFilterSlider
			bind:value={
				() => value,
				(v: number[]) => {
					checked = true;
					value = v;
				}
			}
			bind:label
		/>
	</div>
</div>
