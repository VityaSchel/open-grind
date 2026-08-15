<script lang="ts">
	import { tick, untrack } from "svelte";

	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { Spinner } from "$lib/components/ui/spinner";
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
	let seenTimestamp = $state(0);

	$effect(markLatestMessagesSeen);

	function markLatestMessagesSeen(): void {
		if (!atFloor) return;
		const latest = conversationState.messages.reduce(
			(max, m) => Math.max(max, m.timestamp),
			0,
		);
		untrack(() => {
			if (latest > seenTimestamp) {
				seenTimestamp = latest;
			}
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

	let scrollingToRest = false;
	let scrollingToRestTimer: ReturnType<typeof setTimeout> | null = null;

	async function scrollToRest(behavior: ScrollBehavior) {
		await tick();
		atFloor = true;
		if (behavior === "smooth") {
			scrollingToRest = true;
			if (scrollingToRestTimer !== null)
				clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = setTimeout(endScrollingToRest, 1500);
		}
		refreshControl?.scrollToRest(behavior);
		if (floorDistance() <= 1) endScrollingToRest();
	}

	function endScrollingToRest() {
		scrollingToRest = false;
		if (scrollingToRestTimer !== null) {
			clearTimeout(scrollingToRestTimer);
			scrollingToRestTimer = null;
		}
	}

	function onContainerScroll() {
		if (scrollingToRest) {
			if (floorDistance() <= 1) endScrollingToRest();
			return;
		}
		atFloor = floorDistance() <= FLOOR_SLOP_PX;
	}

	function onContainerScrollEnd() {
		endScrollingToRest();
		atFloor = floorDistance() <= FLOOR_SLOP_PX;
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
			seenTimestamp = 0;
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
				void scrollToRest("smooth");
			}
		}
		lastFirstId = firstId;
	}

	$effect(keepFloorOnComposerResize);

	function keepFloorOnComposerResize(): void {
		void composerHeight;
		const el = container;
		if (!el) return;
		untrack(() => {
			if (!atFloor) return;
			el.scrollTop = el.scrollHeight;
		});
	}
</script>

<div
	class="relative flex min-h-0 max-w-full flex-1 flex-col"
	style:--composer-height="{composerHeight}px"
>
	<div
		data-slot="messages-scroller"
		class="flex min-h-0 max-w-full flex-1 flex-col gap-1 overflow-auto overscroll-contain p-2 pt-20 pb-[calc(var(--composer-height)+--spacing(1.5))] *:first:mt-auto"
		bind:this={container}
		style:overflow-anchor="none"
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
				class="flex min-h-overscrollable shrink-0 flex-col justify-end gap-1"
			>
				{#if conversationState.loadingMore}
					<Spinner class="mt-25 shrink-0 self-center" />
				{/if}
				<ConversationPaginationSentinel {container} />
				<MessagesList bind:seenTimestamp />
			</div>
		{/if}
	</div>
	{#if !conversationState.loading && !conversationState.error}
		<DataRefreshControl
			bind:this={refreshControl}
			{container}
			updating={conversationState.refreshing}
			containerClass="bottom-(--composer-height)"
			hintOffset={8}
			position="bottom"
			onrefresh={() => void conversationState.refresh()}
		/>
		{#if !atFloor}
			<ScrollToBottomButton
				{seenTimestamp}
				onclick={() => void scrollToRest("smooth")}
			/>
		{/if}
	{/if}
</div>
