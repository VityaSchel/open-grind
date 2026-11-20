<script lang="ts">
	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import LocationGate from "#lib/components/location-chooser/LocationGate.svelte";
	import { registerGhostFixup } from "#lib/components/navigation/stack/screen-root.ts";
	import PageTitle from "#lib/components/shared/PageTitle.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import { gridState } from "#lib/grid/grid-state.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import { revealedGridScrollTop, revealInGhostGrid } from "./grid-reveal";
	import Grid from "./Grid.svelte";
	import TopBar from "./top-bar/TopBar.svelte";

	let gridContainer: HTMLElement | null = $state(null);
	let grid: ReturnType<typeof Grid> | undefined = $state();

	restoreScrollOnce({
		container: () => gridContainer,
		state: gridState,
		resolveTop: ({ scroller, savedTop }) => {
			const revealId = gridState.consumeReveal();
			if (revealId === null) return savedTop;
			return revealedGridScrollTop({
				scroller,
				savedTop,
				index: gridState.indexInProfiles(revealId),
			});
		},
	});

	$effect(() =>
		registerGhostFixup({
			path: "/",
			fixup: (ghost) => {
				const profileId = gridState.revealProfileId;
				if (profileId === null) return;
				revealInGhostGrid({
					ghost,
					profileId,
					index: gridState.indexInProfiles(profileId),
				});
			},
		}),
	);

	$effect(() =>
		gridState.onStartOver(() => {
			if (gridContainer) gridContainer.scrollTop = 0;
		}),
	);
</script>

<PageTitle page={t("shell.navBar.tabs.browse")} />
<LocationGate>
	{#snippet children({ geohash })}
		<main class="screen-nav-host">
			<TopBar />
			{#if !gridState.loading && !gridState.error}
				<DataRefreshControl
					container={gridContainer}
					updating={gridState.refreshing}
					failed={gridState.refreshFailed}
					position="top"
					onrefresh={() =>
						void gridState.refresh({ keepLoadedPages: false })}
				/>
			{/if}
			<div
				data-slot="grid-scroller"
				class="pull-scroller scroll-pt-header-clear-17 scroll-pb-nav-clear"
				bind:this={gridContainer}
				onscroll={() =>
					(gridState.scrollY = gridContainer?.scrollTop ?? 0)}
			>
				<div
					data-slot="grid-content"
					data-refresh-content
					class="@container/photo-grid min-h-overscrollable flex flex-col gap-4 px-4 pt-header-clear-17 pb-nav-clear"
				>
					<Grid bind:this={grid} {geohash} />
				</div>
			</div>
			<ScrollToTopButton
				container={gridContainer}
				class="bottom-nav-clear"
				onjump={({ keyboardFocused }) => {
					if (keyboardFocused) grid?.focusFirstCard();
				}}
			/>
		</main>
	{/snippet}
</LocationGate>
