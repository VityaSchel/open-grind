<script lang="ts">
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { getRightNowPostReport } from "#lib/api/safety/reports.ts";
	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import ReportSheet from "#lib/components/report/ReportSheet.svelte";
	import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
	import { formatTimeRelativeCustom } from "#lib/util/format-time.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import type { ReportTarget } from "#lib/components/report/report-request.ts";
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
		onedit,
	}: {
		feed: RightNowFeedState;
		ourProfileId: number;
		ownPostId: RightNowPostId | null;
		ownPostUnderReview: boolean;
		onedit: (() => void) | null;
	} = $props();

	let reportOpen = $state(false);
	let reportTarget = $state<ReportTarget | null>(null);
	let latestReportCheck = 0;

	async function report({
		postId,
		profileId,
	}: {
		postId: RightNowPostId;
		profileId: number | null;
	}) {
		const check = ++latestReportCheck;
		try {
			const earlier = await getRightNowPostReport({ postId, profileId });
			if (check !== latestReportCheck) return;
			if (earlier !== null) {
				toast("Report submitted", {
					description:
						earlier.createTime === null
							? "Awaiting moderation"
							: `${formatTimeRelativeCustom(earlier.createTime)} · Awaiting moderation`,
				});
				return;
			}
		} catch (error) {
			console.error(error);
			if (check === latestReportCheck)
				showErrorToast({
					label: "Failed to check for an earlier report",
					error,
				});
			return;
		}
		reportTarget = { kind: "rightNowPost", postId, profileId };
		reportOpen = true;
	}
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
					<RightNowPostCard
						post={item.data}
						{ourProfileId}
						underReview={ownPostUnderReview}
						{onedit}
						onreport={() =>
							report({
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
									report({
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
{/if}

{#if reportTarget !== null}
	{#key reportTarget}
		<ReportSheet bind:open={reportOpen} target={reportTarget} />
	{/key}
{/if}
