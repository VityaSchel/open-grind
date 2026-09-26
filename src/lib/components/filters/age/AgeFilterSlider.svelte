<script lang="ts">
	import { Slider } from "$lib/components/ui/slider";
	import { AGE_SLIDER_SCALE } from "../slider-scale";

	let { value = $bindable() }: { value: number[] } = $props();
</script>

<Slider
	type="multiple"
	bind:value
	scale={AGE_SLIDER_SCALE}
	thumbLabels={["Minimum age", "Maximum age"]}
/>
