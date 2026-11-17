<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { untrack } from "svelte";

	import { navigationPending } from "#lib/util/history.ts";
	import { SnapPager, type VisiblePositions } from "#lib/util/snap-pager.ts";
	import { INTEREST_TABS, interestTabIndex } from "./tabs";
	import TapsReceivedList from "./taps/TapsReceivedList.svelte";
	import ViewsGrid from "./views/ViewsGrid.svelte";

	let {
		ourProfileId,
		tabIds,
		onUnsettle,
		onSettle,
	}: {
		ourProfileId: number;
		tabIds: readonly { tab: string; panel: string }[];
		onUnsettle: () => void;
		onSettle: (tab: number) => void;
	} = $props();

	const TABS = INTEREST_TABS.map((tab) => tab.href);

	let mounted = $state([false, false]);
	let onScreen = $state<VisiblePositions | null>(null);
	let paging = false;
	let heading: number | null = null;
	let restedPane: number | null = null;

	const routed = $derived(interestTabIndex(page.url.pathname));
	const offScreen = $derived(
		TABS.map(
			(_, pane) =>
				onScreen !== null &&
				(pane < onScreen.first || pane > onScreen.last),
		),
	);

	const snap = new SnapPager({
		count: () => TABS.length,
		onVisible: (visible) => {
			const { first, last } = visible;
			for (let pane = first; pane <= last; pane += 1)
				mounted[pane] = true;
			onScreen = visible;
			paging = first !== last;
			if (paging) onUnsettle();
		},
		onHeading: (pane) => {
			heading = pane;
		},
		onRest: (pane) => {
			onSettle(pane);
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
			void goto(landed, { replace: true, reset: false });
		},
	});

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

	function swallowClickOutsideHeadingPane(
		event: MouseEvent & { currentTarget: HTMLElement },
	) {
		if (!paging || heading === null) return;
		const headingPane = event.currentTarget.children[heading];
		if (event.target instanceof Node && headingPane?.contains(event.target))
			return;
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<main
	data-slot="interest-pager"
	data-scroll-intent="x"
	ontouchstart={onUnsettle}
	onclickcapture={swallowClickOutsideHeadingPane}
	class="screen-nav-host no-scrollbar flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
	{@attach snap.attach}
>
	<div
		id={tabIds[0]?.panel}
		role="tabpanel"
		aria-labelledby={tabIds[0]?.tab}
		inert={offScreen[0]}
		aria-hidden={offScreen[0] ? "true" : undefined}
		data-slot="interest-pane-views"
		class="w-full shrink-0 snap-start"
	>
		{#if mounted[0]}
			<ViewsGrid {ourProfileId} />
		{/if}
	</div>
	<div
		id={tabIds[1]?.panel}
		role="tabpanel"
		aria-labelledby={tabIds[1]?.tab}
		inert={offScreen[1]}
		aria-hidden={offScreen[1] ? "true" : undefined}
		data-slot="interest-pane-taps"
		class="w-full shrink-0 snap-start"
	>
		{#if mounted[1]}
			<TapsReceivedList {ourProfileId} active={routed === 1} />
		{/if}
	</div>
</main>

<style>
	[data-slot="interest-pager"] {
		scroll-timeline: --interest-pager x;
	}
</style>
