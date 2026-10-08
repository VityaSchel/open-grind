<script lang="ts">
	import { Slider } from "$lib/components/ui/slider";
	import { t } from "$lib/i18n";
	import { AGE_SLIDER_SCALE } from "../slider-scale";

	let { value = $bindable() }: { value: number[] } = $props();
</script>

<Slider
	type="multiple"
	bind:value
	scale={AGE_SLIDER_SCALE}
	thumbLabels={[
		t("browse.filters.age.a11y.minimum"),
		t("browse.filters.age.a11y.maximum"),
	]}
/>
