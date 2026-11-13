<script lang="ts">
	import { untrack } from "svelte";

	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import QuickFiltersBar from "#lib/components/filters/QuickFiltersBar.svelte";
	import LocationChange from "#lib/components/location-chooser/LocationChange.svelte";
	import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request.ts";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import RightNowPostControls from "./post/RightNowPostControls.svelte";
	import { getRightNowFeedState } from "./right-now-feed-state.svelte";
	import { getRightNowPostState } from "./right-now-post-state.svelte";
	import RightNowFeedList from "./RightNowFeedList.svelte";
	import QuickFilters from "./top-bar/QuickFilters.svelte";

	let { ourProfileId, geohash }: { ourProfileId: number; geohash: string } =
		$props();

	const feed = untrack(() => getRightNowFeedState(ourProfileId));
	const ownPost = untrack(() => getRightNowPostState(ourProfileId));

	let container: HTMLDivElement | null = $state(null);
	let sheetOpen = $state(false);
	let sheetRequested = rightNowPostSheetRequest.take();
	let labeledChip = $state(false);

	$effect(() => feed.attachView());

	$effect(() => feed.followLocation(geohash));

	$effect(() => ownPost.followLocation(geohash));

	$effect(() => {
		if (!sheetRequested || ownPost.loading) return;
		sheetRequested = false;
		if (ownPost.post !== null) sheetOpen = true;
	});

	restoreScrollOnce({ container: () => container, state: feed });

	$effect(() =>
		feed.onStartOver(() => {
			if (container) container.scrollTop = 0;
		}),
	);
</script>

<main class="screen-nav-host">
	<QuickFiltersBar contentClass="mx-auto w-full max-w-160">
		<LocationChange />
		<QuickFilters filters={feed.filters} />
	</QuickFiltersBar>
	{#if !feed.loading && (feed.entries.length > 0 || !feed.error)}
		<DataRefreshControl
			{container}
			updating={feed.refreshing}
			position="top"
			onrefresh={() => void feed.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="right-now-scroller"
		class="relative pull-scroller [scrollbar-gutter:stable_both-edges]"
		onscroll={() => (feed.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="mx-auto min-h-overscrollable flex w-full max-w-160 flex-col px-4 pt-header-clear-17 pb-nav-clear"
		>
			<RightNowFeedList
				{feed}
				{ourProfileId}
				ownPostId={ownPost.post?.id ?? null}
				ownPostUnderReview={ownPost.pendingModeration}
				joinable={ownPost.status === "none" &&
					ownPost.freePostsLeft !== 0}
				onedit={ownPost.post === null ? null : () => (sheetOpen = true)}
			/>
		</div>
	</div>
	<ScrollToTopButton
		{container}
		text={feed.hasNewPosts ? "New posts" : undefined}
		onjump={feed.hasNewPosts ? () => void feed.refresh() : undefined}
		bind:labeled={labeledChip}
		class="bottom-nav-clear"
	/>
	<RightNowPostControls post={ownPost} compact={labeledChip} bind:sheetOpen />
</main>
