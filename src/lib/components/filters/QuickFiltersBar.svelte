<script lang="ts">
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { topChrome } from "#lib/util/screen-chrome.svelte.ts";

	let {
		contentClass,
		children,
	}: {
		contentClass?: import("svelte/elements").ClassValue;
		children: import("svelte").Snippet;
	} = $props();
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-fixed-header"
	direction="topToBottom"
	{@attach topChrome}
>
	<div
		data-scroll-intent="x"
		class={[
			"scrollbar-thin flex gap-0.5 overflow-x-auto p-4 pt-0",
			contentClass,
		]}
	>
		{@render children()}
	</div>
</ProgressiveBlur>
