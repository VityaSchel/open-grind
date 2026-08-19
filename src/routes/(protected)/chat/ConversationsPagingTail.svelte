<script lang="ts">
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { InboxPaging } from "$lib/chat/inbox-paging.svelte";
	import EmptyConversationsList from "./EmptyConversationsList.svelte";

	let {
		paging,
		hasMore,
		listEmpty,
		filtered,
	}: {
		paging: InboxPaging;
		hasMore: boolean;
		listEmpty: boolean;
		filtered: boolean;
	} = $props();
</script>

<div role="status" class="sr-only">
	{paging.running
		? "Loading more conversations"
		: paging.failure
			? "Failed to load more conversations"
			: ""}
</div>
{#if listEmpty && !hasMore}
	<EmptyConversationsList {filtered} />
{/if}
{#if hasMore}
	{#if paging.failure}
		<div class={["flex", { "flex-1": listEmpty }]}>
			<ApiErrorDisplay
				error={paging.failure}
				onRetry={() => paging.retry()}
				class="m-auto"
			/>
		</div>
	{:else if paging.running || listEmpty}
		{#each Array(listEmpty ? 8 : 6)}
			<Skeleton class="h-24.5 w-full shrink-0" />
		{/each}
	{/if}
	{#key paging.armToken}
		<div
			class="h-0"
			use:observeIntersection={{
				handle: () => paging.run(),
				rootMargin: "400px",
			}}
		></div>
	{/key}
{/if}
