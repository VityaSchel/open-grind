<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { tick } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { below } from "$lib/util/breakpoints.svelte";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import { SelectionSet } from "$lib/util/selection.svelte";
	import type { ConversationsState } from "$lib/chat/conversations-state.svelte";
	import Conversation from "./Conversation.svelte";
	import ConversationsFilters from "./ConversationsFilters.svelte";
	import ConversationsPagingTail from "./ConversationsPagingTail.svelte";
	import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";
	import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";
	import LazyConversation from "./LazyConversation.svelte";

	const EAGER_COUNT = 10;

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");

	$effect(() => {
		conversations.noteListViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce(() => container, conversations);

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	const selection = new SelectionSet<string>();
	let selecting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteIds: string[] = $state([]);

	async function compensateScroll() {
		if (!container) return;
		const paddingBefore = parseFloat(
			getComputedStyle(container).paddingTop,
		);
		const scrollBefore = container.scrollTop;
		await tick();
		if (!container) return;
		const delta =
			parseFloat(getComputedStyle(container).paddingTop) - paddingBefore;
		if (delta !== 0) {
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

	dismissOnBackGesture({ active: () => selecting, dismiss: exitSelection });
	dismissOnBackGesture({
		active: () => deleteDialogOpen,
		dismiss: () => {
			deleteDialogOpen = false;
		},
	});

	function pinSelected() {
		const conversationIds = selection.values();
		const pinned = !allPinned;
		exitSelection();
		void conversations.setPinned({ conversationIds, pinned });
	}

	function muteSelected() {
		const conversationIds = selection.values();
		const muted = !allMuted;
		exitSelection();
		void conversations.setMuted({ conversationIds, muted });
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

<div class="flex h-full w-full min-w-list-rail flex-col">
	<div class="relative flex min-h-0 flex-1 flex-col">
		<div
			bind:this={container}
			data-slot="conversations-scroller"
			class={[
				"flex min-h-0 flex-1 flex-col gap-1 overflow-auto overscroll-contain px-4",
				{
					"pt-15": !selecting,
					"pt-(--selection-bar-height)": selecting,
				},
				className,
			]}
			onscroll={() => (conversations.scrollY = container?.scrollTop ?? 0)}
		>
			{#if conversations.loading}
				{#each Array(8)}
					<Skeleton class="h-24.5 w-full shrink-0" />
				{/each}
			{:else if conversations.error}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={conversations.error}
						onRetry={() => conversations.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				<div
					class="flex min-h-overscrollable shrink-0 flex-col gap-1 pb-nav-clear"
				>
					{#each conversations.entries as conversation, i (conversation.data.conversationId)}
						{@const conversationId =
							conversation.data.conversationId}
						{#if i < EAGER_COUNT}
							<Conversation
								{conversation}
								selection={selecting ? selection : null}
								onEnterSelection={mobile.current
									? () => enterSelection(conversationId)
									: undefined}
								onRequestDelete={() =>
									requestDelete([conversationId])}
							/>
						{:else}
							<LazyConversation
								{conversation}
								selection={selecting ? selection : null}
								onEnterSelection={mobile.current
									? () => enterSelection(conversationId)
									: undefined}
								onRequestDelete={() =>
									requestDelete([conversationId])}
							/>
						{/if}
					{/each}
					<ConversationsPagingTail
						paging={conversations.paging}
						hasMore={conversations.nextPage !== null}
						listEmpty={conversations.entries.length === 0}
						filtered={conversations.filters.active.length > 0}
					/>
				</div>
			{/if}
		</div>
		{#if !conversations.loading && !conversations.error}
			<DataRefreshControl
				{container}
				updating={conversations.refreshing}
				position="top"
				onrefresh={() => void conversations.refresh()}
			/>
		{/if}
		<ConversationsFilters
			filters={conversations.filters}
			onchange={(active) => conversations.setFilters(active)}
			inert={selecting}
		/>
	</div>
</div>
