<script lang="ts">
	import type { Snippet } from "svelte";

	import { preferredScrollBehavior } from "$lib/util/reduced-motion";

	let {
		fullsize = true,
		children,
	}: { fullsize?: boolean; children: Snippet } = $props();

	const SETTLE_QUIET_MS = 140;

	let sheet = $state<HTMLDivElement | null>(null);
	let peek = $state<HTMLDivElement | null>(null);
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let atTop = $state(true);

	function settleToNearestSize() {
		const el = sheet;
		const range = peek?.offsetHeight ?? 0;
		if (!el || el.scrollTop <= 0 || el.scrollTop >= range) return;
		el.scrollTo({
			top: el.scrollTop < range / 2 ? 0 : range,
			behavior: preferredScrollBehavior(),
		});
	}

	function onScroll() {
		atTop = (sheet?.scrollTop ?? 0) < 1;
		scheduleSettle();
	}

	function scheduleSettle() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			settleTimer = null;
			settleToNearestSize();
		}, SETTLE_QUIET_MS);
	}

	$effect(() => () => {
		if (settleTimer !== null) clearTimeout(settleTimer);
	});
</script>

<div
	bind:this={sheet}
	data-slot="sheet-scroller"
	onscroll={onScroll}
	class={[
		"no-scrollbar overflow-x-hidden overscroll-contain select-none",
		{
			"h-full overflow-y-auto": fullsize,
			"h-fit": !fullsize,
			"touch-pan-down": fullsize && atTop,
		},
	]}
>
	{#if fullsize}
		<div
			bind:this={peek}
			data-slot="sheet-peek"
			class="pointer-events-none h-2/5"
		></div>
	{/if}
	<div
		data-slot="sheet-panel"
		class={[
			"rounded-t-4xl border border-border bg-popover px-4 pb-20 shadow-xl",
			{ "min-h-full": fullsize },
		]}
	>
		<div
			data-slot="drawer-handle"
			class="mx-auto my-3 h-1.5 w-25 rounded-full bg-muted"
		></div>
		{@render children()}
	</div>
</div>
