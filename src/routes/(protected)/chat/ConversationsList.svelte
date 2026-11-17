<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { page } from "$app/state";
	import { onDestroy, tick } from "svelte";

	import { getConversations } from "#lib/chat/conversations-context.svelte.ts";
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import { escapeMeansBack } from "#lib/components/navigation/escape-back.ts";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { focusIsLost } from "#lib/platform/reveal-keyboard-focus.ts";
	import { below } from "#lib/util/breakpoints.svelte.ts";
	import { leaveDeletedPages } from "#lib/util/deleted-pages.ts";
	import {
		RovingFocusState,
		type RovingKey,
	} from "#lib/util/roving-focus-state.svelte.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import { SelectionSet } from "#lib/util/selection.svelte.ts";
	import type { ConversationsState } from "#lib/chat/conversations-state.svelte.ts";
	import ConversationsPagingTail from "./ConversationsPagingTail.svelte";
	import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";
	import DeleteConversationsDialog from "./DeleteConversationsDialog.svelte";
	import ConversationsFilters from "./filters/ConversationsFilters.svelte";
	import LazyConversation from "./LazyConversation.svelte";
	import { MountQueue } from "./mount-queue";

	let {
		covered = false,
		filtersLocked = false,
		class: className,
	}: {
		covered?: boolean;
		filtersLocked?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const EAGER_COUNT = 10;
	const SOLE_ROW_CELL =
		'[data-slot="conversation-placeholder"], [data-slot="profile-item-selection-toggle"]';
	const CONVERSATION_LINK = '[data-slot="profile-item-link"]';
	const ROW_CELLS = 'a[href], [data-slot="conversation-actions"]';

	const conversations: ConversationsState = getConversations();
	const mobile = below("split");
	const mountQueue = new MountQueue();

	onDestroy(() => mountQueue.destroy());

	$effect(() => {
		if (!covered) conversations.noteListViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce({ container: () => container, state: conversations });

	function rowCells(row: HTMLElement): HTMLElement[] {
		const sole = row.querySelector<HTMLElement>(SOLE_ROW_CELL);
		if (sole !== null) return [sole];
		return [...row.querySelectorAll<HTMLElement>(ROW_CELLS)].filter(
			(cell) => cell.getClientRects().length > 0,
		);
	}

	const roving = new RovingFocusState({
		keys: () =>
			conversations.entries.map((entry) => entry.data.conversationId),
		orientation: "vertical",
		cells: rowCells,
		primaryCell: (cells) =>
			cells.find((cell) => cell.matches(CONVERSATION_LINK)) ?? cells[0]!,
		restingKey: () => page.params.conversationId ?? null,
	});
	let rows: HTMLDivElement | null = $state(null);

	function rowOf(conversationId: RovingKey): HTMLElement | null {
		return (
			rows?.querySelector<HTMLElement>(
				`[data-conversation-id="${CSS.escape(String(conversationId))}"]`,
			) ?? null
		);
	}

	function focusConversationLink(conversationId: RovingKey) {
		const row = rowOf(conversationId);
		const link =
			row &&
			rowCells(row).find((cell) => cell.matches(CONVERSATION_LINK));
		if (link) link.focus();
		else void roving.focus({ key: conversationId });
	}

	const selection = new SelectionSet<string>();
	let selecting = $state(false);
	let deleteDialogOpen = $state(false);
	let deleteIds: string[] = $state([]);
	let neighborAfterLeavingDeleted: string | null = null;

	afterNavigate(({ to }) => {
		const conversationId = neighborAfterLeavingDeleted;
		neighborAfterLeavingDeleted = null;
		if (
			conversationId !== null &&
			to?.url.pathname === "/chat" &&
			focusIsLost()
		)
			focusConversationLink(conversationId);
	});

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

	async function enterSelection(conversationId: string) {
		const focused = document.activeElement;
		const byKeyboard =
			focused?.matches(":focus-visible") === true &&
			rowOf(conversationId)?.contains(focused) === true;
		if (!selecting) {
			selecting = true;
			void compensateScroll();
		}
		selection.add(conversationId);
		if (!byKeyboard) return;
		await tick();
		void roving.focus({ key: conversationId });
	}

	function exitSelection() {
		if (selecting) {
			selecting = false;
			void compensateScroll();
		}
		selection.clear();
	}

	$effect(() => {
		if (selecting && (!mobile.current || covered || selection.size === 0)) {
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

	async function exitSelectionKeepingFocus({
		byKeyboard = document.activeElement?.matches(":focus-visible") === true,
		alongside,
	}: {
		byKeyboard?: boolean;
		alongside?: (conversationIds: string[]) => void;
	} = {}) {
		const conversationId = roving.activeKey;
		const conversationIds = selection.values();
		exitSelection();
		alongside?.(conversationIds);
		if (conversationId === null || !byKeyboard) return;
		await tick();
		if (roving.focusWithin || focusIsLost())
			focusConversationLink(conversationId);
	}

	function exitSelectionOnEscape(event: KeyboardEvent) {
		if (event.key !== "Escape" || !selecting || !escapeMeansBack(event))
			return;
		event.preventDefault();
		void exitSelectionKeepingFocus({ byKeyboard: true });
	}

	dismissOnBackGesture({
		active: () => selecting,
		dismiss: exitSelection,
		layer: "screen",
	});
	dismissOnBackGesture({
		active: () => deleteDialogOpen,
		dismiss: () => {
			deleteDialogOpen = false;
		},
	});

	function pinSelected() {
		const pinned = !allPinned;
		void exitSelectionKeepingFocus({
			alongside: (conversationIds) =>
				void conversations.setPinned({ conversationIds, pinned }),
		});
	}

	function muteSelected() {
		const muted = !allMuted;
		void exitSelectionKeepingFocus({
			alongside: (conversationIds) =>
				void conversations.setMuted({ conversationIds, muted }),
		});
	}

	function requestDelete(conversationIds: string[]) {
		deleteIds = conversationIds;
		deleteDialogOpen = true;
	}

	async function confirmDelete() {
		const confirmedFrom = document.activeElement;
		const byKeyboard = confirmedFrom?.matches(":focus-visible") === true;
		const leavesOpenConversation = deleteIds.some(
			(id) => id === page.params.conversationId,
		);
		exitSelection();
		leaveDeletedPages({
			pathnames: deleteIds.map((id) => `/chat/${id}`),
			parent: "/chat",
		});
		const keys = conversations.entries.map(
			(entry) => entry.data.conversationId,
		);
		const conversationIds = deleteIds.filter((id) => keys.includes(id));
		if (conversationIds.length === 0) return;
		const firstDeleted = keys.findIndex((id) =>
			conversationIds.includes(id),
		);
		void conversations.deleteConversations(conversationIds);
		if (!byKeyboard) return;
		await tick();
		const neighbor = conversations.entries.at(
			Math.min(firstDeleted, conversations.entries.length - 1),
		)?.data.conversationId;
		if (neighbor === undefined) return;
		if (leavesOpenConversation) neighborAfterLeavingDeleted = neighbor;
		else if (document.activeElement === confirmedFrom || focusIsLost())
			focusConversationLink(neighbor);
	}
</script>

<svelte:window onkeydown={exitSelectionOnEscape} />

{#if selecting}
	<ConversationsSelectionBar
		count={selection.size}
		{allPinned}
		{allMuted}
		onPin={pinSelected}
		onMute={muteSelected}
		onDelete={() => requestDelete(selection.values())}
		onClose={() => void exitSelectionKeepingFocus()}
	/>
{/if}
<DeleteConversationsDialog
	bind:open={deleteDialogOpen}
	count={deleteIds.length}
	onConfirm={() => void confirmDelete()}
/>

<div class="flex h-full w-full min-w-list-rail flex-col">
	<div class="relative flex min-h-0 flex-1 flex-col">
		<ConversationsFilters
			filters={conversations.filters}
			onchange={(values) => conversations.setFilters(values)}
			inert={selecting}
			locked={filtersLocked}
		/>
		{#if !conversations.loading && (conversations.entries.length > 0 || !conversations.error)}
			<DataRefreshControl
				container={covered ? null : container}
				updating={conversations.refreshing}
				position="top"
				onrefresh={() => void conversations.refresh()}
			/>
		{/if}
		<div
			bind:this={container}
			data-slot="conversations-scroller"
			class={[
				"flex min-h-0 flex-1 scroll-pb-nav-clear flex-col gap-1 overflow-auto overscroll-contain px-4",
				{
					"scroll-pt-header-clear-15 pt-header-clear-15": !selecting,
					"scroll-pt-[calc(var(--selection-bar-height)+var(--bar-content-gap))] pt-[calc(var(--selection-bar-height)+var(--bar-content-gap))]":
						selecting,
				},
				className,
			]}
			onscroll={() => (conversations.scrollY = container?.scrollTop ?? 0)}
		>
			{#if conversations.loading}
				{#each Array(8)}
					<Skeleton class="h-24.5 w-full shrink-0" />
				{/each}
			{:else if conversations.error && conversations.entries.length === 0}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={conversations.error}
						onRetry={() => conversations.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				<div
					data-refresh-content
					class="min-h-overscrollable flex shrink-0 flex-col gap-1 pb-nav-clear"
				>
					<div
						bind:this={rows}
						class="flex flex-col gap-1 empty:hidden"
						{@attach roving.container}
					>
						{#each conversations.entries as conversation, i (conversation.data.conversationId)}
							{@const conversationId =
								conversation.data.conversationId}
							<div
								data-slot="conversation-row"
								data-conversation-id={conversationId}
								{@attach roving.item(conversationId)}
							>
								<LazyConversation
									{conversation}
									eager={i < EAGER_COUNT}
									queue={mountQueue}
									selection={selecting ? selection : null}
									onEnterSelection={mobile.current
										? () =>
												void enterSelection(
													conversationId,
												)
										: undefined}
									onRequestDelete={() =>
										requestDelete([conversationId])}
								/>
							</div>
						{/each}
					</div>
					<ConversationsPagingTail
						paging={conversations.paging}
						hasMore={conversations.nextPage !== null}
						listEmpty={conversations.entries.length === 0}
						filtered={conversations.filters.filtered}
					/>
				</div>
			{/if}
		</div>
		<ScrollToTopButton {container} class="bottom-(--nav-clear)" />
	</div>
</div>
