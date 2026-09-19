<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { untrack } from "svelte";

	import { navigationPending } from "$lib/util/history";
	import { SnapPager } from "$lib/util/snap-pager";
	import { INTEREST_TABS } from "./tabs";
	import TapsReceivedList from "./taps/TapsReceivedList.svelte";
	import ViewsGrid from "./views/ViewsGrid.svelte";

	const TABS = INTEREST_TABS.map((tab) => tab.href);

	let { ourProfileId }: { ourProfileId: number } = $props();

	let mounted = $state([false, false]);
	let restedPane: number | null = null;

	const routed = $derived(Math.max(0, TABS.indexOf(page.url.pathname)));

	const snap = new SnapPager({
		count: () => TABS.length,
		onRest: (pane) => {
			const landed = TABS[pane];
			const pending = navigating.to?.url.pathname;
			const ownReplacePending =
				restedPane !== null && pending === TABS[restedPane];
			if (pane !== restedPane) restedPane = null;
			if (
				!landed ||
				landed === pending ||
				(landed === page.url.pathname && !ownReplacePending) ||
				navigationPending({
					owns: (pathname) => TABS.includes(pathname),
				})
			)
				return;
			restedPane = pane;
			void goto(landed, { replaceState: true, noScroll: true });
		},
	});

	function mountVisiblePanes(el: HTMLElement) {
		const width = el.clientWidth;
		if (width <= 0) return;
		for (const [index] of TABS.entries()) {
			const visible =
				Math.min((index + 1) * width, el.scrollLeft + width) -
				Math.max(index * width, el.scrollLeft);
			if (visible > 0) mounted[index] = true;
		}
	}

	$effect(() => {
		mounted[routed] = true;
	});

	$effect(() => {
		const pane = routed;
		const restedHere = pane === restedPane;
		restedPane = null;
		if (!restedHere) untrack(() => snap.place(pane, { animated: true }));
	});

	afterNavigate(() => {
		const ownReplaceDropped = restedPane !== null && restedPane !== routed;
		if (!ownReplaceDropped) return;
		restedPane = null;
		snap.place(routed, { animated: true });
	});
</script>

<div
	data-slot="interest-pager"
	class="no-scrollbar flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
	onscroll={(event) => mountVisiblePanes(event.currentTarget)}
	{@attach snap.attach}
>
	<div data-slot="interest-pane-views" class="w-full shrink-0 snap-start">
		{#if mounted[0]}
			<ViewsGrid {ourProfileId} />
		{/if}
	</div>
	<div data-slot="interest-pane-taps" class="w-full shrink-0 snap-start">
		{#if mounted[1]}
			<TapsReceivedList {ourProfileId} active={routed === 1} />
		{/if}
	</div>
</div>

<style>
	[data-slot="interest-pager"] {
		scroll-timeline: --interest-pager x;
	}
</style>
