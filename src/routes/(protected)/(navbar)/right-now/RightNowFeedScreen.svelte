<script lang="ts">
	import { untrack } from "svelte";

	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import QuickFiltersBar from "#lib/components/filters/QuickFiltersBar.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import { getRightNowFeedState } from "./right-now-feed-state.svelte";
	import RightNowFeedList from "./RightNowFeedList.svelte";
	import QuickFilters from "./top-bar/QuickFilters.svelte";

	let { ourProfileId, geohash }: { ourProfileId: number; geohash: string } =
		$props();

	const feed = untrack(() => getRightNowFeedState(ourProfileId));

	let container: HTMLDivElement | null = $state(null);

	$effect(() => feed.attachView());

	$effect(() => feed.followLocation(geohash));

	restoreScrollOnce({ container: () => container, state: feed });

	$effect(() =>
		feed.onStartOver(() => {
			if (container) container.scrollTop = 0;
		}),
	);
</script>

<main class="screen-nav-host">
	<QuickFiltersBar>
		<QuickFilters filters={feed.filters} />
	</QuickFiltersBar>
	{#if !feed.loading && !feed.error}
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
		class="pull-scroller"
		onscroll={() => (feed.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="mx-auto min-h-overscrollable flex w-full max-w-160 flex-col px-4 pt-header-clear-17 pb-nav-clear"
		>
			<RightNowFeedList {feed} {ourProfileId} />
		</div>
	</div>
	<ScrollToTopButton {container} class="bottom-nav-clear" />
</main>
