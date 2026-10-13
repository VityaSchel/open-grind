<script lang="ts">
	import type { Snippet } from "svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import * as Tabs from "$lib/components/ui/tabs";

	let { children }: { children: Snippet } = $props();
</script>

<ProgressiveBlur
	direction="bottomToTop"
	data-slot="media-sheet-tab-bar"
	class="absolute inset-x-0 bottom-0 z-10 select-none"
	bgClass="bg-linear-to-t from-background to-transparent"
	contentClass="flex justify-center pt-1 pb-2"
>
	<Tabs.List>
		{@render children()}
	</Tabs.List>
</ProgressiveBlur>
