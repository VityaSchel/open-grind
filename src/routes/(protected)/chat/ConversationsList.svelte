<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { onMount, tick, untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
	import { below } from "$lib/util/breakpoints.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { ConversationsState } from "$lib/chat/conversations-state.svelte";
	import Conversation from "./Conversation.svelte";
	import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";
	import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";
	import EmptyConversationsList from "./EmptyConversationsList.svelte";
	import LazyConversation from "./LazyConversation.svelte";

	const EAGER_COUNT = 10;

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");

	const latestActivity = $derived(
		conversations.entries.reduce(
			(max, entry) => Math.max(max, entry.data.lastActivityTimestamp),
			0,
		),
	);
	$effect(() => {
		// Fixes effect_update_depth_exceeded
		void latestActivity;
		untrack(() => conversations.markInboxViewed());
	});

	let container: HTMLDivElement | null = $state(null);

	onMount(() => {
		void conversations.initial.then(tick).then(() => {
			if (container && conversations.listScrollY > 0) {
				container.scrollTop = conversations.listScrollY;
			}
		});
	});

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const selection = new SelectionSet<string>();
	let selecting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteIds: string[] = $state([]);

	async function compensateScroll() {
		if (!container) return;
		const paddingBefore = parseFloat(getComputedStyle(container).paddingTop);
		const scrollBefore = container.scrollTop;
		await tick();
		if (!container) return;
		const delta =
			parseFloat(getComputedStyle(container).paddingTop) - paddingBefore;
		if (delta !== 0 && (scrollBefore > 0 || delta < 0)) {
			container.scrollTop = Math.max(0, scrollBefore + delta);
		}
	}

	const selectedEntries = $derived(
		conversations.entries.filter((entry) =>
			selection.has(entry.data.conversationId),
		),
	);
	const allPinned = $derived(
		selectedEntries.length > 0 &&
			selectedEntries.every((entry) => entry.data.pinned),
	);
	const allMuted = $derived(
		selectedEntries.length > 0 &&
			selectedEntries.every((entry) => entry.data.muted),
	);

	function enterSelection(conversationId: string) {
		if (!selecting) {
			selecting = true;
			void compensateScroll();
		}
		selection.add(conversationId);
	}

	function exitSelection() {
		if (selecting) {
			selecting = false;
			void compensateScroll();
		}
		selection.clear();
	}

	$effect(() => {
		if (selecting && (!mobile.current || selection.size === 0)) {
			exitSelection();
		}
	});

	$effect(() => {
		if (!selecting) return;
		const known = new Set(
			conversations.entries.map((entry) => entry.data.conversationId),
		);
		for (const conversationId of selection.values()) {
			if (!known.has(conversationId)) selection.delete(conversationId);
		}
	});

	$effect(() => {
		if (!selecting && !deleteDialogOpen) return;
		const onBackGesture = () => {
			if (deleteDialogOpen) {
				deleteDialogOpen = false;
			} else {
				exitSelection();
			}
			return false;
		};
		backGestureEventHandlers.add(onBackGesture);
		return () => {
			backGestureEventHandlers.delete(onBackGesture);
		};
	});

	function pinSelected() {
		const conversationIds = selection.values();
		const pinned = !allPinned;
		exitSelection();
		void conversations.setPinned(conversationIds, pinned);
	}

	function muteSelected() {
		const conversationIds = selection.values();
		const muted = !allMuted;
		exitSelection();
		void conversations.setMuted(conversationIds, muted);
	}

	function requestDelete(conversationIds: string[]) {
		deleteIds = conversationIds;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		exitSelection();
		if (deleteIds.some((id) => id === page.params.conversationId)) {
			await goto("/chat");
		}
		const known = new Set(
			conversations.entries.map((entry) => entry.data.conversationId),
		);
		const conversationIds = deleteIds.filter((id) => known.has(id));
		if (conversationIds.length === 0) return;
		void conversations.deleteConversations(conversationIds);
	}

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(es) => {
				if (es[0].isIntersecting)
					conversations.loadMore().catch((error) => console.error(error));
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

{#if selecting}
	<ConversationsSelectionBar
		count={selection.size}
		{allPinned}
		{allMuted}
		onPin={pinSelected}
		onMute={muteSelected}
		onDelete={() => requestDelete(selection.values())}
		onClose={exitSelection}
	/>
{/if}
<DeleteConversationsDialog
	bind:open={deleteDialogOpen}
	count={deleteIds.length}
	onConfirm={() => void confirmDelete()}
/>

<div
	bind:this={container}
	class={[
		"flex h-full w-full min-w-list-rail flex-col gap-1 overflow-auto overscroll-auto p-4 pb-nav-clear",
		selecting && "pt-(--selection-bar-height)",
		className,
	]}
	onscroll={() => (conversations.listScrollY = container?.scrollTop ?? 0)}
>
	{#await conversations.initial}
		{#each Array(8)}
			<Skeleton class="h-24.5 w-full shrink-0" />
		{/each}
	{:then}
		<DataRefreshControl
			{container}
			updating={conversations.refreshing}
			class="mb-3"
			containerClass="z-10"
			position="top"
			onclick={() => void conversations.refresh()}
		/>
		<div class="flex min-h-[calc(100%+1rem)] flex-col gap-1">
			{#each conversations.entries as conversation, i (conversation.data.conversationId)}
				{@const conversationId = conversation.data.conversationId}
				{#if i < EAGER_COUNT}
					<Conversation
						{conversation}
						selection={selecting ? selection : null}
						onEnterSelection={mobile.current
							? () => enterSelection(conversationId)
							: undefined}
						onRequestDelete={() => requestDelete([conversationId])}
					/>
				{:else}
					<LazyConversation
						{conversation}
						selection={selecting ? selection : null}
						onEnterSelection={mobile.current
							? () => enterSelection(conversationId)
							: undefined}
						onRequestDelete={() => requestDelete([conversationId])}
					/>
				{/if}
			{:else}
				<EmptyConversationsList />
			{/each}
			{#if conversations.loadingMore}
				{#each Array(6)}
					<Skeleton class="h-24.5 w-full shrink-0" />
				{/each}
			{/if}
			{#if conversations.nextPage !== null}
				<div class="h-0" use:observeSentinel></div>
			{/if}
		</div>
	{:catch error}
		<div class="flex flex-1">
			<ApiErrorDisplay
				{error}
				onRetry={() => conversations.retry()}
				class="m-auto"
			/>
		</div>
	{/await}
</div>
