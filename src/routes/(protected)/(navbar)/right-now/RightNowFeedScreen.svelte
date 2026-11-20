<script lang="ts">
	import { tick, untrack } from "svelte";

	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import QuickFiltersBar from "#lib/components/filters/QuickFiltersBar.svelte";
	import LocationChange from "#lib/components/location-chooser/LocationChange.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { focusIsLost } from "#lib/platform/reveal-keyboard-focus.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import { TOP_SLOP_PX } from "#lib/util/scroll.ts";
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
	let list: ReturnType<typeof RightNowFeedList> | undefined = $state();
	let sheetOpen = $state(false);
	let labeledChip = $state(false);

	$effect(() => feed.attachView());

	$effect(() => feed.followLocation(geohash));

	$effect(() => ownPost.followLocation(geohash));

	$effect.pre(() => {
		if (feed.entries.length === 0) return;
		untrack(() => {
			if (container !== null && container.scrollTop <= TOP_SLOP_PX)
				container.scrollTop = 0;
		});
	});

	restoreScrollOnce({ container: () => container, state: feed });

	$effect(() =>
		feed.onStartOver(() => {
			if (container) container.scrollTop = 0;
		}),
	);

	async function jumpToTop({
		keyboardFocused,
	}: {
		keyboardFocused: boolean;
	}) {
		if (!feed.hasNewPosts) {
			if (keyboardFocused) list?.focusFirstPost();
			return;
		}
		await feed.refresh();
		await tick();
		if (keyboardFocused && focusIsLost()) list?.focusFirstPost();
	}
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
			failed={feed.refreshFailed}
			position="top"
			onrefresh={() => void feed.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="right-now-scroller"
		class="relative pull-scroller scroll-pt-header-clear-17 scroll-pb-nav-clear [scrollbar-gutter:stable_both-edges]"
		onscroll={() => feed.followScroll(container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="mx-auto min-h-overscrollable flex w-full max-w-160 flex-col px-4 pt-header-clear-17 pb-nav-clear"
		>
			<RightNowFeedList
				bind:this={list}
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
		text={feed.hasNewPosts ? t("browse.rightNow.feed.newPosts") : undefined}
		onjump={(jump) => void jumpToTop(jump)}
		bind:labeled={labeledChip}
		class="bottom-nav-clear"
	/>
	<RightNowPostControls {ownPost} compact={labeledChip} bind:sheetOpen />
</main>
