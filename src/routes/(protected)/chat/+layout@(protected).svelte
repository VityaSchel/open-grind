<script lang="ts">
	import { page } from "$app/state";
	import { onDestroy, untrack } from "svelte";

	import {
		getOrCreateConversationsState,
		setConversations,
	} from "$lib/chat/conversations-context.svelte";
	import NavBar from "$lib/components/shared/NavBar.svelte";
	import * as Card from "$lib/components/ui/card";
	import * as Resizable from "$lib/components/ui/resizable";
	import { defaultConversationFilters } from "$lib/model/messaging/conversation-filters";
	import { below } from "$lib/util/breakpoints.svelte";
	import ConversationScreen from "./[conversationId]/ConversationScreen.svelte";
	import ConversationsList from "./ConversationsList.svelte";
	import LiveStack from "./live-stack/LiveStack.svelte";

	let { data }: import("./$types").LayoutProps = $props();

	const conversations = untrack(() =>
		getOrCreateConversationsState(data.ourProfileId),
	);
	setConversations(conversations);
	onDestroy(() => conversations.setFilters(defaultConversationFilters));

	const CONVERSATIONS_LIST_MIN_WIDTH_PX = 200;
	const PAGE_CONTENT_MIN_WIDTH_PX = 280;

	let paneGroup: HTMLElement | null = $state(null);
	let conversationsListCollapsedSizePercentage = $state(0);
	let conversationsListMinWidthPercentage = $state(0);
	let pageContentMinWidthPercentage = $state(0);

	$effect(() => {
		if (!paneGroup) return;
		const listRailPx = parseFloat(
			getComputedStyle(paneGroup).getPropertyValue("--list-rail"),
		);
		const observer = new ResizeObserver(() => {
			if (!paneGroup) return;
			conversationsListCollapsedSizePercentage =
				listRailPx / paneGroup.offsetWidth;
			conversationsListMinWidthPercentage =
				CONVERSATIONS_LIST_MIN_WIDTH_PX / paneGroup.offsetWidth;
			pageContentMinWidthPercentage =
				PAGE_CONTENT_MIN_WIDTH_PX / paneGroup.offsetWidth;
		});
		observer.observe(paneGroup);
		return () => observer.disconnect();
	});

	const conversationId = $derived(page.params.conversationId ?? null);

	const mobile = below("split");
</script>

{#snippet conversationScreen(id: string, leaving = false)}
	<ConversationScreen
		conversationId={id}
		ourProfileId={data.ourProfileId}
		{leaving}
	/>
{/snippet}

{#if mobile.current}
	<LiveStack
		basePath="/chat"
		keyOf={(target) => target.params?.conversationId ?? null}
	>
		{#snippet base({ covered })}
			<main class="flex min-h-0 flex-1 flex-col">
				<ConversationsList {covered} />
			</main>
			<NavBar ourProfileId={data.ourProfileId} />
		{/snippet}
		{#snippet sheet(id, { leaving })}
			<main class="flex min-h-0 flex-1 flex-col">
				{@render conversationScreen(id, leaving)}
			</main>
		{/snippet}
	</LiveStack>
{:else}
	<main
		class="flex h-dvh w-full flex-1 pt-(--safe-area-top) pb-(--safe-area-bottom)"
	>
		<Resizable.PaneGroup
			direction="horizontal"
			class="mx-auto h-auto! max-h-full max-w-300"
			bind:ref={paneGroup}
			autoSaveId="/(protected)/chat/layout"
		>
			<Resizable.Pane
				defaultSize={43}
				minSize={conversationsListMinWidthPercentage * 100}
				collapsedSize={conversationsListCollapsedSizePercentage * 100}
				collapsible
				class="min-w-list-rail"
			>
				<ConversationsList class="pe-0.75" />
			</Resizable.Pane>
			<Resizable.Handle
				class="cursor-col-resize! bg-transparent px-2"
				withHandle
			/>
			<Resizable.Pane
				defaultSize={57}
				minSize={pageContentMinWidthPercentage * 100}
			>
				<div class="h-full flex-1 self-stretch p-4 ps-1 pb-nav-clear">
					<Card.Root
						class={[
							"relative h-full gap-0 rounded-chat-panel p-0 dark:ring-neutral-800",
							{ "bg-card/20 ring-0": conversationId === null },
						]}
					>
						{#if conversationId === null}
							<Card.Content class="m-auto flex p-6">
								<span class="text-center text-xl text-muted">
									Select a conversation to start chatting
								</span>
							</Card.Content>
						{:else}
							{@render conversationScreen(conversationId)}
						{/if}
					</Card.Root>
				</div>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</main>
	<NavBar ourProfileId={data.ourProfileId} />
{/if}
