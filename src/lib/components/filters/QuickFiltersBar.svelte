<script lang="ts">
	import ProgressiveBlur from "#lib/components/shared/ProgressiveBlur.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { topChrome } from "#lib/util/screen-chrome.svelte.ts";
	import {
		QuickFilterChips,
		setQuickFilterChips,
	} from "./quick-filter-chips.svelte";

	let {
		contentClass,
		children,
	}: {
		contentClass?: import("svelte/elements").ClassValue;
		children: import("svelte").Snippet;
	} = $props();

	const chips = setQuickFilterChips(new QuickFilterChips());
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
		role="toolbar"
		aria-label={t("browse.quickFilters.a11y.toolbar")}
		data-scroll-intent="x"
		class={[
			"scrollbar-thin -mt-1 flex gap-0.5 overflow-x-auto p-4 pt-1",
			contentClass,
		]}
		{@attach chips.container}
	>
		{@render children()}
	</div>
</ProgressiveBlur>
