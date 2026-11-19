<script lang="ts">
	import { afterNavigate, goto } from "$app/navigation";
	import { navigating, page } from "$app/state";
	import { tick, untrack } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import { scrollGestureHere } from "#lib/platform/scroll-gesture.ts";
	import { navigationPending } from "#lib/util/history.ts";
	import { SnapPager } from "#lib/util/snap-pager.ts";
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
	const UNMOVED_WHEEL_MS = 150;

	let mounted = $state([false, false]);
	let shownPane = $state<number | null>(null);
	let pager: HTMLElement | null = null;
	let paging = false;
	let heading: number | null = null;
	let restedPane: number | null = null;

	const fingerPhase = scrollGestureHere();
	const routed = $derived(interestTabIndex(page.url.pathname));
	const hiddenPanes = $derived(
		TABS.map((_, pane) => shownPane !== null && pane !== shownPane),
	);

	const snap = new SnapPager({
		count: () => TABS.length,
		fingerPhase,
		onVisible: ({ first, last }) => {
			for (let pane = first; pane <= last; pane += 1)
				mounted[pane] = true;
			paging = first !== last;
			if (paging) onUnsettle();
		},
		onHeading: (pane) => {
			heading = pane;
		},
		onRest: (pane) => {
			if (fingerPhase?.phase !== "momentum") showOnly(pane);
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
		if (!restedHere) untrack(() => glideTo(pane));
	});

	afterNavigate(() => {
		const ownReplaceDropped = restedPane !== null && restedPane !== routed;
		if (!ownReplaceDropped) return;
		restedPane = null;
		glideTo(routed);
	});

	function glideTo(pane: number) {
		showOnly(pane);
		snap.place(pane, { animated: true });
	}

	function showAll() {
		shownPane = null;
	}

	function showOnly(pane: number) {
		if (pane === shownPane) return;
		const focusLeaves = [...(pager?.children ?? [])].some(
			(other, index) =>
				index !== pane && other.contains(document.activeElement),
		);
		shownPane = pane;
		if (focusLeaves) void tick().then(() => focusPane(pane));
	}

	function focusPane(pane: number) {
		const shown = pager?.children[pane];
		if (pane === shownPane && shown instanceof HTMLElement)
			shown.focus({ preventScroll: true });
	}

	function sidewaysWheel({ deltaX, deltaY, shiftKey }: WheelEvent) {
		return shiftKey || Math.abs(deltaX) > Math.abs(deltaY);
	}

	const showAllOnInput: Attachment<HTMLElement> = (node) => {
		const listening = new AbortController();
		const options = { passive: true, signal: listening.signal };
		let unmovedWheel: ReturnType<typeof setTimeout> | undefined;
		const forgetWheel = () => clearTimeout(unmovedWheel);
		window.addEventListener("touchstart", showAll, {
			...options,
			capture: true,
		});
		node.addEventListener(
			"wheel",
			(event) => {
				if (!sidewaysWheel(event)) return;
				showAll();
				forgetWheel();
				unmovedWheel = setTimeout(
					() => snap.settleNow(),
					UNMOVED_WHEEL_MS,
				);
			},
			options,
		);
		node.addEventListener("scroll", forgetWheel, options);
		const stopPhase = fingerPhase?.onPhaseChange((phase) => {
			if (phase === "fingers") showAll();
		});
		return () => {
			listening.abort();
			forgetWheel();
			stopPhase?.();
		};
	};

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
	bind:this={pager}
	data-slot="interest-pager"
	data-scroll-intent="x"
	tabindex="-1"
	ontouchstart={onUnsettle}
	onclickcapture={swallowClickOutsideHeadingPane}
	class="screen-nav-host no-scrollbar flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden"
	{@attach snap.attach}
	{@attach showAllOnInput}
>
	<div
		id={tabIds[0]?.panel}
		role="tabpanel"
		aria-labelledby={tabIds[0]?.tab}
		tabindex="-1"
		inert={hiddenPanes[0]}
		aria-hidden={hiddenPanes[0] ? "true" : undefined}
		data-slot="interest-pane-views"
		class="w-full shrink-0 snap-start -outline-offset-2"
	>
		{#if mounted[0]}
			<ViewsGrid {ourProfileId} />
		{/if}
	</div>
	<div
		id={tabIds[1]?.panel}
		role="tabpanel"
		aria-labelledby={tabIds[1]?.tab}
		tabindex="-1"
		inert={hiddenPanes[1]}
		aria-hidden={hiddenPanes[1] ? "true" : undefined}
		data-slot="interest-pane-taps"
		class="w-full shrink-0 snap-start -outline-offset-2"
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
