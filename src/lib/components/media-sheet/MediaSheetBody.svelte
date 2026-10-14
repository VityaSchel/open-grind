<script lang="ts">
	import type { Snippet } from "svelte";

	import { preferredScrollBehavior } from "$lib/util/reduced-motion";

	let {
		fullsize = true,
		children,
	}: { fullsize?: boolean; children: Snippet } = $props();

	const SETTLE_QUIET_MS = 140;
	const EXPANDED_TOLERANCE_PX = 1;

	let sheet = $state<HTMLDivElement | null>(null);
	let peek = $state<HTMLDivElement | null>(null);
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	let sizeHolds = 0;
	let atTop = $state(true);
	let expanded = $state(false);
	let observedPeekHeight = 0;
	let expandedContentScrollTop: number | null = null;

	function expandedScrollTop(): number {
		return peek?.offsetHeight ?? 0;
	}

	function resizeAwaitingObserver(): boolean {
		return expandedScrollTop() !== observedPeekHeight;
	}

	function measureExpandedContentScrollTop(): number | null {
		const scrollTop = sheet?.scrollTop ?? 0;
		const range = observedPeekHeight;
		if (range === 0 || scrollTop < range - EXPANDED_TOLERANCE_PX)
			return null;
		return Math.max(0, scrollTop - range);
	}

	function keepSizeAcrossResize() {
		observedPeekHeight = expandedScrollTop();
		if (expandedContentScrollTop === null) scheduleSettle();
		else if (sheet)
			sheet.scrollTop = observedPeekHeight + expandedContentScrollTop;
	}

	function settleToNearestSize() {
		const el = sheet;
		const range = expandedScrollTop();
		if (!el || el.scrollTop <= 0 || el.scrollTop >= range) return;
		el.scrollTo({
			top: el.scrollTop < range / 2 ? 0 : range,
			behavior: preferredScrollBehavior(),
		});
	}

	export function contentScrollTop(): number {
		return measureExpandedContentScrollTop() ?? 0;
	}

	export function restoreContentScrollTop(contentTop: number) {
		const top = expandedScrollTop();
		if (sheet && sheet.scrollTop >= top - EXPANDED_TOLERANCE_PX)
			sheet.scrollTop = top + contentTop;
	}

	export function scrollContentToTop() {
		const top = expandedScrollTop();
		if (sheet && sheet.scrollTop > top) sheet.scrollTo({ top });
	}

	export function expand() {
		const top = expandedScrollTop();
		if (sheet && sheet.scrollTop < top)
			sheet.scrollTo({ top, behavior: preferredScrollBehavior() });
	}

	export function holdSize(): () => void {
		sizeHolds += 1;
		cancelSettle();
		let held = true;
		return () => {
			if (!held) return;
			held = false;
			sizeHolds -= 1;
			scheduleSettle();
		};
	}

	function onScroll() {
		const scrollTop = sheet?.scrollTop ?? 0;
		atTop = scrollTop < 1;
		expanded =
			peek !== null &&
			scrollTop >= peek.offsetHeight - EXPANDED_TOLERANCE_PX;
		// A scroll event can land between a resize's layout and its ResizeObserver callback, carrying either a scroll-anchoring adjustment or a pre-resize offset
		if (!resizeAwaitingObserver())
			expandedContentScrollTop = measureExpandedContentScrollTop();
		scheduleSettle();
	}

	function cancelSettle() {
		if (settleTimer !== null) clearTimeout(settleTimer);
		settleTimer = null;
	}

	function scheduleSettle() {
		cancelSettle();
		if (sizeHolds > 0) return;
		settleTimer = setTimeout(() => {
			settleTimer = null;
			settleToNearestSize();
		}, SETTLE_QUIET_MS);
	}

	$effect(() => cancelSettle);

	$effect(() => {
		if (!sheet || !peek) return;
		const observer = new ResizeObserver(keepSizeAcrossResize);
		observer.observe(sheet);
		return () => {
			observer.disconnect();
			observedPeekHeight = 0;
			expandedContentScrollTop = null;
		};
	});
</script>

{#if fullsize && expanded}
	<div
		aria-hidden="true"
		data-slot="sheet-backdrop"
		class="pointer-events-none absolute inset-x-0 top-8 bottom-0 -z-10 bg-popover"
	></div>
{/if}
<div
	bind:this={sheet}
	data-slot="sheet-scroller"
	data-at-top={fullsize && atTop ? "" : undefined}
	onscroll={onScroll}
	class={[
		"group/sheet no-scrollbar overflow-x-hidden overscroll-contain select-none",
		{
			"h-full scroll-pb-[calc(--spacing(30)+var(--bar-content-gap))] overflow-y-auto":
				fullsize,
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
			"flex flex-col rounded-t-4xl bg-popover px-4 pb-20 shadow-xl ring-1 ring-border ring-inset",
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
