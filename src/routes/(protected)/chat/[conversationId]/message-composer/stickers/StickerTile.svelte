<script lang="ts">
	import type { Snippet } from "svelte";
	import type { ClassValue } from "svelte/elements";

	import SelectionOverlay from "$lib/components/shared/SelectionOverlay.svelte";

	let {
		label,
		selected,
		onclick,
		class: className,
		children,
	}: {
		label: string;
		selected: boolean;
		onclick: () => void;
		class?: ClassValue;
		children: Snippet;
	} = $props();
</script>

<button
	type="button"
	data-slot="sticker-tile"
	class={["relative cursor-pointer scroll-mt-18 rounded-lg", className]}
	aria-label={label}
	aria-pressed={selected}
	{onclick}
>
	{@render children()}
	{#if selected}
		<SelectionOverlay />
	{/if}
</button>
