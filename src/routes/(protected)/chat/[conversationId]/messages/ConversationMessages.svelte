<script lang="ts">
	import { tick, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";

	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { edgeGap } from "$lib/components/feedback/refresh/scroll-geometry";
	import { Spinner } from "$lib/components/ui/spinner";
	import { preferredScrollBehavior } from "$lib/util/reduced-motion";
	import { getConversationState } from "../conversation-state.svelte";
	import ConversationError from "./ConversationError.svelte";
	import ConversationPaginationSentinel from "./ConversationPaginationSentinel.svelte";
	import MessagesList from "./MessagesList.svelte";
	import MessagesListSkeleton from "./MessagesListSkeleton.svelte";
	import ScrollToBottomButton from "./ScrollToBottomButton.svelte";

	let { composerHeight }: { composerHeight: number } = $props();

	const conversationState = $derived(getConversationState()());

	let container: HTMLDivElement | null = $state(null);
	let refreshControl: DataRefreshControl | undefined = $state();

	const FLOOR_SLOP_PX = 16;

	let atFloor = $state(true);
	let restingFloorDistance = 0;
	let readerScrollTop = 0;
	let ownScrollTop: number | null = null;
	// Seen-ness is tracked by message identity, never by comparing timestamps:
	// merges adopt server timestamps for messages already on screen, and a
	// watermark would re-count them as new.
	const seenMessageIds = new SvelteSet<string>();

	$effect(markMessagesSeenAtFloor);

	function markMessagesSeenAtFloor(): void {
		if (!atFloor) return;
		// the conversation-switch clear() must retrigger this refill, in
		// whichever order the two effects run
		void seenMessageIds.size;
		const messages = conversationState.messages;
		untrack(() => {
			for (const message of messages)
				seenMessageIds.add(message.messageId);
		});
	}

	function floorDistance() {
		if (!container) return 0;
		return (
			container.scrollHeight -
			container.clientHeight -
			container.scrollTop
		);
	}

	function reachedFloor() {
		return edgeGap(floorDistance()) <= 0;
	}

	let scrollingToRest = false;
	let scrollingToRestTimer: ReturnType<typeof setTimeout> | null = null;

	async function scrollToRest(behavior: ScrollBehavior) {
		await tick();
		atFloor = true;
		restingFloorDistance = 0;
		if (behavior === "smooth") {
			scrollingToRest = true;
			if (scrollingToRestTimer !== null)
				clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = setTimeout(endScrollingToRest, 1500);
		}
		refreshControl?.scrollToRest(behavior);
		if (reachedFloor()) endScrollingToRest();
	}

	function endScrollingToRest() {
		scrollingToRest = false;
		if (scrollingToRestTimer !== null) {
			clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = null;
		}
	}

	function onContainerScroll() {
		if (!readerScrolled()) return;
		ownScrollTop = null;
		if (scrollingToRest) {
			if (reachedFloor()) endScrollingToRest();
			return;
		}
		recordRestingPlace();
	}

	function onContainerScrollEnd() {
		endScrollingToRest();
		if (readerScrolled()) recordRestingPlace();
	}

	function recordRestingPlace(scrollTop = container?.scrollTop ?? 0): void {
		readerScrollTop = scrollTop;
		restingFloorDistance = floorDistance();
		atFloor = restingFloorDistance <= FLOOR_SLOP_PX;
	}

	$effect(stopSmoothScrollOnGesture);

	function stopSmoothScrollOnGesture() {
		const el = container;
		if (!el) return;
		el.addEventListener("wheel", endScrollingToRest, { passive: true });
		el.addEventListener("touchstart", endScrollingToRest, {
			passive: true,
		});
		return () => {
			el.removeEventListener("wheel", endScrollingToRest);
			el.removeEventListener("touchstart", endScrollingToRest);
		};
	}

	let scrollDone = false;
	let lastFirstId = "";

	$effect(resetForNewConversation);

	function resetForNewConversation(): void {
		void conversationState.conversationId;
		untrack(() => {
			scrollDone = false;
			lastFirstId = "";
			atFloor = true;
			restingFloorDistance = 0;
			readerScrollTop = 0;
			ownScrollTop = null;
			seenMessageIds.clear();
			endScrollingToRest();
		});
	}

	$effect(scrollToRestWhenLoaded);

	function scrollToRestWhenLoaded(): void {
		if (!conversationState.loading && !scrollDone && container) {
			scrollDone = true;
			void scrollToRest("instant");
		}
	}

	$effect(followNewMessages);

	function followNewMessages(): void {
		const firstMessage = conversationState.messages.at(0);
		const firstId = firstMessage?.messageId ?? "";
		if (
			scrollDone &&
			firstMessage &&
			firstId &&
			firstId !== lastFirstId &&
			lastFirstId !== ""
		) {
			if (
				firstMessage.senderId === conversationState.ourProfileId ||
				untrack(() => atFloor)
			) {
				void scrollToRest(preferredScrollBehavior());
			}
		}
		lastFirstId = firstId;
	}

	function keepBottomEdge({
		scroller,
		heightChange,
	}: {
		scroller: HTMLElement;
		heightChange: number;
	}): void {
		const intended = readerScrollTop - heightChange;
		scroller.scrollTop = intended;
		ownScrollTop = scroller.scrollTop;
		recordRestingPlace(intended);
	}

	function holdFloor(el: HTMLElement): void {
		if (scrollingToRest) refreshControl?.scrollToRest("smooth");
		else if (edgeGap(restingFloorDistance) === 0)
			el.scrollTop = el.scrollHeight;
		else
			el.scrollTop =
				el.scrollHeight - el.clientHeight - restingFloorDistance;
	}

	function retargetRestScroll(): void {
		if (scrollingToRest) refreshControl?.scrollToRest("smooth");
	}

	let observedScrollerSize: { width: number; height: number } | null = null;

	// A resize can clamp scrollTop before the observer below runs, and the
	// observer's own writes scroll too. Neither is the reader's scroll.
	function readerScrolled(): boolean {
		return (
			!scrollerResizePending() && container?.scrollTop !== ownScrollTop
		);
	}

	function scrollerResizePending(): boolean {
		const observed = observedScrollerSize;
		return (
			container !== null &&
			observed !== null &&
			(container.offsetWidth !== observed.width ||
				container.offsetHeight !== observed.height)
		);
	}

	$effect(keepBottomOnScrollerResize);

	function keepBottomOnScrollerResize() {
		const el = container;
		if (!el) return;
		observedScrollerSize = null;
		const observer = new ResizeObserver(() => {
			const previous = observedScrollerSize;
			const resized = scrollerResizePending();
			observedScrollerSize = {
				width: el.offsetWidth,
				height: el.offsetHeight,
			};
			if (!resized || !previous) return;
			if (atFloor || scrollingToRest) holdFloor(el);
			else
				keepBottomEdge({
					scroller: el,
					heightChange: el.offsetHeight - previous.height,
				});
		});
		observer.observe(el, { box: "border-box" });
		return () => observer.disconnect();
	}

	$effect(keepFloorOnComposerResize);

	function keepFloorOnComposerResize(): void {
		void composerHeight;
		const el = container;
		if (!el) return;
		untrack(() => {
			if (atFloor || scrollingToRest) holdFloor(el);
			else if (!scrollerResizePending()) recordRestingPlace();
		});
	}
</script>

<div class="relative flex min-h-0 max-w-full flex-1 flex-col">
	<div
		data-slot="messages-scroller"
		class="flex min-h-0 max-w-full flex-1 flex-col gap-1 overflow-auto overscroll-contain p-2 pt-20 *:first:mt-auto"
		bind:this={container}
		style:overflow-anchor="none"
		style:padding-bottom="calc({composerHeight}px + var(--spacing) * 1.5)"
		onscroll={onContainerScroll}
		onscrollend={onContainerScrollEnd}
	>
		{#if conversationState.loading}
			{#key conversationState.conversationId}
				<MessagesListSkeleton />
			{/key}
		{:else if conversationState.error}
			<ConversationError />
		{:else}
			<div
				class="min-h-overscrollable flex shrink-0 flex-col justify-end gap-1"
			>
				<div class="flex h-10 shrink-0 items-center justify-center">
					{#if conversationState.loadingMore}
						<Spinner />
					{/if}
				</div>
				<ConversationPaginationSentinel {container} />
				<MessagesList {seenMessageIds} />
			</div>
		{/if}
	</div>
	{#if !conversationState.loading && (conversationState.messages.length > 0 || !conversationState.error)}
		<DataRefreshControl
			bind:this={refreshControl}
			{container}
			updating={conversationState.refreshing}
			anchorOffset={composerHeight}
			hintOffset={8}
			position="bottom"
			onrefresh={() => void conversationState.refresh()}
			oninsetchange={retargetRestScroll}
		/>
		<div class="contents" style:--composer-height="{composerHeight}px">
			{#if !atFloor}
				<ScrollToBottomButton
					{seenMessageIds}
					onclick={() => void scrollToRest(preferredScrollBehavior())}
				/>
			{/if}
		</div>
	{/if}
</div>
