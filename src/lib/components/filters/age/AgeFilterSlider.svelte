<script lang="ts">
	import { Slider } from "$lib/components/ui/slider";
	import { AGE_MAX, AGE_MIN } from "$lib/model/browse/grid/filters";

	let { value = $bindable() }: { value: number[] } = $props();
</script>

<Slider
	type="multiple"
	bind:value
	min={AGE_MIN}
	max={AGE_MAX}
	step={1}
	thumbLabels={["Minimum age", "Maximum age"]}
/>
