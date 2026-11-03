<script lang="ts">
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import DiscreetPostCard from "./DiscreetPostCard.svelte";
	import EmptyRightNowFeed from "./EmptyRightNowFeed.svelte";
	import type { RightNowFeedState } from "./right-now-feed-state.svelte";
	import RightNowPostCard from "./RightNowPostCard.svelte";

	let {
		feed,
		ourProfileId,
	}: { feed: RightNowFeedState; ourProfileId: number } = $props();
</script>

{#if feed.loading}
	{#each Array(4)}
		<div class="flex gap-3 py-3">
			<Skeleton class="size-12 shrink-0 rounded-full" />
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<Skeleton class="h-6 w-3/4" />
				<Skeleton class="aspect-square w-full max-w-3xs rounded-xl" />
				<Skeleton class="my-2 h-5 w-1/3" />
			</div>
		</div>
	{/each}
{:else if feed.error && feed.entries.length === 0}
	<div class="flex flex-1">
		<ApiErrorDisplay
			error={feed.error}
			onRetry={() => feed.retry()}
			class="m-auto"
		/>
	</div>
{:else if feed.entries.length === 0}
	<EmptyRightNowFeed filters={feed.filters} />
{:else}
	<ul class="flex flex-col">
		{#each feed.entries as item (item.data.id)}
			<li>
				{#if item.type === "right_now_post_v3" || item.type === "locked_post_v1"}
					<RightNowPostCard post={item.data} {ourProfileId} />
				{:else}
					<DiscreetPostCard post={item.data} />
				{/if}
			</li>
		{/each}
	</ul>
	{#if feed.hasMore}
		<div
			class="h-0"
			use:observeIntersection={{
				handle: () => feed.loadMore(),
				rootMargin: "400px",
			}}
		></div>
	{/if}
{/if}
