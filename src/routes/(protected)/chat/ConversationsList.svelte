<script lang="ts">
	import { onMount, tick, untrack } from "svelte";

	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/DataRefreshControl.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import type { ConversationsState } from "$lib/chat/conversations.svelte";
	import Conversation from "./Conversation.svelte";
	import EmptyConversationsList from "./EmptyConversationsList.svelte";
	import LazyConversation from "./LazyConversation.svelte";

	const EAGER_COUNT = 10;

	const conversations: ConversationsState = getConversations();

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

<div
	bind:this={container}
	class={[
		"flex h-full w-full min-w-list-rail flex-col gap-1 overflow-auto overscroll-auto p-4 pb-nav-clear",
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
				{#if i < EAGER_COUNT}
					<Conversation {conversation} />
				{:else}
					<LazyConversation {conversation} />
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
