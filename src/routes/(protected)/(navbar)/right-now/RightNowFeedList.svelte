<script lang="ts">
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import { RightNowPostReportState } from "#lib/components/report/right-now-post-report-state.svelte.ts";
	import RightNowPostReportSheet from "#lib/components/report/RightNowPostReportSheet.svelte";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import type { RightNowPostId } from "#lib/model/safety/reports.ts";
	import DiscreetPostCard from "./DiscreetPostCard.svelte";
	import EmptyRightNowFeed from "./EmptyRightNowFeed.svelte";
	import type { RightNowFeedState } from "./right-now-feed-state.svelte";
	import RightNowPostCard from "./RightNowPostCard.svelte";

	let {
		feed,
		ourProfileId,
		ownPostId,
		ownPostUnderReview,
		joinable,
		onedit,
	}: {
		feed: RightNowFeedState;
		ourProfileId: number;
		ownPostId: RightNowPostId | null;
		ownPostUnderReview: boolean;
		joinable: boolean;
		onedit: (() => void) | null;
	} = $props();

	const report = new RightNowPostReportState();
</script>

{#if feed.loading}
	{#each Array(4)}
		<div class="flex gap-3 py-3">
			<Skeleton class="size-12 shrink-0 rounded-full" />
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<Skeleton class="h-6 w-3/4" />
				<Skeleton class="aspect-square w-full max-w-3xs rounded-xl" />
				<div class="flex items-center justify-between gap-2">
					<Skeleton class="h-5 w-1/3" />
					<Skeleton class="h-8 w-24 rounded-4xl" />
				</div>
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
	<EmptyRightNowFeed
		filters={feed.filters}
		ownPostRunning={ownPostId !== null}
		{joinable}
	/>
{:else}
	<ul class="flex flex-col">
		{#each feed.entries as item (item.data.id)}
			<li>
				{#if item.type === "right_now_post_v3" || item.type === "locked_post_v1"}
					<RightNowPostCard
						post={item.data}
						{ourProfileId}
						underReview={ownPostUnderReview}
						{onedit}
						onreport={() =>
							report.request({
								postId: item.data.id,
								profileId: item.data.profileId,
							})}
					/>
				{:else}
					<DiscreetPostCard
						post={item.data}
						onreport={item.data.id === ownPostId
							? null
							: () =>
									report.request({
										postId: item.data.id,
										profileId: null,
									})}
					/>
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
	<div data-slot="right-now-join-clearance" class="h-12 shrink-0"></div>
{/if}

<RightNowPostReportSheet {report} />
