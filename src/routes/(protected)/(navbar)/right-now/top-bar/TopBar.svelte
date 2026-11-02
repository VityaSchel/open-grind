<script lang="ts">
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { topChrome } from "#lib/util/screen-chrome.svelte.ts";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let { filters }: { filters: RightNowFeedFiltersState } = $props();
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
		class="scrollbar-thin flex gap-0.5 overflow-x-auto p-4 pt-0"
	>
		<QuickFilters {filters} />
	</div>
</ProgressiveBlur>
