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
	import { below } from "$lib/util/breakpoints.svelte";
	import ConversationsList from "./ConversationsList.svelte";

	let { data, children }: import("./$types").LayoutProps = $props();

	const conversations = untrack(() =>
		getOrCreateConversationsState(data.ourProfileId),
	);
	setConversations(conversations);
	onDestroy(() => conversations.setFilters([]));

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

	const isChatSelected = $derived(page.params.conversationId !== undefined);

	const mobile = below("split");
</script>

<main
	class="flex h-dvh w-full flex-1 pt-(--safe-area-top) pb-(--safe-area-bottom)"
>
	{#if !mobile.current}
		<Resizable.PaneGroup
			direction="horizontal"
			class="mx-auto h-auto! max-h-full max-w-300 max-split:hidden!"
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
							{ "bg-card/20 ring-0": !isChatSelected },
						]}
					>
						{@render children?.()}
					</Card.Root>
				</div>
			</Resizable.Pane>
		</Resizable.PaneGroup>
	{/if}
	{#if isChatSelected}
		{#if mobile.current}
			<div class="flex max-w-full flex-1 flex-col self-stretch">
				{@render children?.()}
			</div>
		{/if}
	{:else if mobile.current}
		<ConversationsList />
	{/if}
</main>
{#if !mobile.current || page.route.id !== "/(protected)/chat/[conversationId]"}
	<NavBar ourProfileId={data.ourProfileId} />
{/if}
