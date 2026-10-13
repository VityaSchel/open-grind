<script lang="ts">
	import type { Snippet } from "svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import * as Tabs from "$lib/components/ui/tabs";

	let { children, trailing }: { children: Snippet; trailing?: Snippet } =
		$props();
</script>

<ProgressiveBlur
	direction="bottomToTop"
	data-slot="media-sheet-tab-bar"
	class="absolute inset-x-0 bottom-0 z-10 select-none"
	bgClass="bg-linear-to-t from-background to-transparent"
	contentClass="grid grid-cols-[1fr_auto_1fr] items-end gap-x-2 px-4 pt-1 pb-2"
>
	<Tabs.List class="col-start-2">
		{@render children()}
	</Tabs.List>
	{#if trailing}
		<div class="col-start-3 max-w-full min-w-0 justify-self-end pb-1">
			{@render trailing()}
		</div>
	{/if}
</ProgressiveBlur>
