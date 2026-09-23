<script lang="ts">
	import { expoOut } from "svelte/easing";

	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { fly } from "$lib/util/reduced-motion";
	import { bottomChrome } from "$lib/util/screen-chrome.svelte";

	let {
		saving,
		disabled = false,
		type = "button",
		onclick,
	}: {
		saving: boolean;
		disabled?: boolean;
		type?: "button" | "submit";
		onclick: () => void;
	} = $props();
</script>

<div
	data-slot="save-changes-bar"
	class="sticky bottom-(--content-pb) z-10 -mx-4 mt-auto -mb-[calc(4.5rem+var(--bar-content-gap))] px-4 pb-3"
	transition:fly={{ y: 80, duration: 300, easing: expoOut }}
	{@attach bottomChrome}
>
	<Button
		{type}
		size="lg"
		class="h-12 w-full text-base"
		disabled={disabled || saving}
		{onclick}
	>
		{#if saving}
			<Spinner class="size-5" />
		{/if}
		Save changes
	</Button>
</div>
