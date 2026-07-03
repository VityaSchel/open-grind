<script lang="ts">
	import { acceptNSFWPics } from "$lib/model/profile";
	import FilterSimpleArray from "./FilterSimpleArray.svelte";

	let {
		checked = $bindable(),
		value = $bindable(),
	}: { checked: boolean; value: number[] } = $props();
</script>

<FilterSimpleArray
	bind:checked
	bind:value
	id="accept-nsfw-pics"
	label="Accept NSFW Pics"
	items={Object.entries(acceptNSFWPics).map(([value, label]) => ({
		value: Number(value),
		label,
	}))}
	convert={Number}
	notSpecified
/>
