<script lang="ts">
	import { ArrowLeftIcon } from "phosphor-svelte";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { getConversationState } from "../conversation-state.svelte";
	import ConversationNavBarProfile from "./ConversationNavBarProfile.svelte";

	const conversationState = $derived(getConversationState()());
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="absolute z-10 h-19 w-full shrink-0"
	bgClass="bg-linear-to-b max-split:from-background split:from-card to-transparent"
	contentClass="flex items-center h-full"
	tag="nav"
>
	<a
		href="/chat"
		aria-label="Back to chats"
		class="flex h-full w-19 items-center justify-center"
	>
		<ArrowLeftIcon size={32} />
	</a>
	{#if conversationState.loading || conversationState.profile === null}
		<div class="flex flex-1 items-center gap-3 py-4 ps-0">
			<Skeleton class="size-avatar rounded-full" />
			<div class="flex flex-col gap-2">
				<Skeleton class="h-4 w-20 rounded-md" />
				<Skeleton class="h-3 w-12 rounded-md" />
			</div>
		</div>
	{:else if conversationState.error}
		<span class="flex-1">Failed to load conversation</span>
	{:else}
		<ConversationNavBarProfile profile={conversationState.profile} />
	{/if}
</ProgressiveBlur>
