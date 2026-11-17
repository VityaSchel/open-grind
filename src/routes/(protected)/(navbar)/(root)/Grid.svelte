<script lang="ts">
	import { page } from "$app/state";

	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import PagingSentinel from "#lib/components/shared/PagingSentinel.svelte";
	import { gridState } from "#lib/grid/grid-state.svelte.ts";
	import { t } from "#lib/i18n/index.ts";
	import { visibleBand } from "#lib/platform/reveal-keyboard-focus.ts";
	import {
		gridColumns,
		RovingFocusState,
		type RovingKey,
	} from "#lib/util/roving-focus-state.svelte.ts";
	import { nearestScrollableAncestor } from "#lib/util/scroll.ts";
	import {
		readGridMetrics,
		virtualGrid,
	} from "#lib/util/virtual-grid.svelte.ts";
	import EmptyGrid from "./EmptyGrid.svelte";
	import { revealedGridScrollTop } from "./grid-reveal";
	import GridCellSkeleton from "./GridCellSkeleton.svelte";
	import GridProfileMiniCard from "./GridProfileMiniCard.svelte";

	const PAGE_SKELETONS = 20;

	let { geohash }: { geohash: string } = $props();

	const revealedProfileId = gridState.revealProfileId;

	let gridElement: HTMLElement | null = $state(null);
	let wrapper: HTMLElement | null = null;

	const empty = $derived(gridState.profiles.length === 0);
	const profileIds = $derived(gridState.profiles.map(({ id }) => id));
	const pendingSkeletons = $derived(
		gridState.paging.running ? PAGE_SKELETONS : 0,
	);
	const view = virtualGrid({
		grid: () => gridElement,
		count: () => gridState.profiles.length + pendingSkeletons,
	});
	const visibleProfiles = $derived(
		gridState.profiles.slice(view.startIndex, view.endIndex),
	);
	const visibleSkeletons = $derived(
		Math.max(
			0,
			view.endIndex -
				Math.max(view.startIndex, gridState.profiles.length),
		),
	);

	function sitsInsideBand(key: RovingKey): boolean {
		const index = profileIds.findIndex((profileId) => profileId === key);
		if (gridElement === null || index < 0) return false;
		const { columns, cellPx, gapPx } = readGridMetrics(gridElement);
		const band = visibleBand(nearestScrollableAncestor(gridElement));
		const top =
			gridElement.getBoundingClientRect().top +
			Math.floor(index / columns) * (cellPx + gapPx);
		return top >= band.top - 0.5 && top + cellPx <= band.bottom + 0.5;
	}

	if (revealedProfileId !== null) gridState.keyboardStop = revealedProfileId;

	const roving = new RovingFocusState({
		keys: () => profileIds,
		orientation: "grid",
		columns: () => (gridElement === null ? 1 : gridColumns(gridElement)),
		wrap: "rows",
		followScroll: "first-visible",
		restingKey: () => {
			const key = gridState.keyboardStop;
			return key !== null && sitsInsideBand(key) ? key : null;
		},
		pageRows: () => {
			if (gridElement === null) return 1;
			const { cellPx, gapPx } = readGridMetrics(gridElement);
			const band = visibleBand(nearestScrollableAncestor(gridElement));
			const rows = Math.floor(
				(band.bottom - band.top) / (cellPx + gapPx),
			);
			return cellPx > 0 ? Math.max(1, rows) : 1;
		},
		reveal: (index) => {
			const scroller =
				gridElement && nearestScrollableAncestor(gridElement);
			if (!(scroller instanceof HTMLElement)) return;
			scroller.scrollTop = revealedGridScrollTop({
				scroller,
				savedTop: scroller.scrollTop,
				index,
			});
		},
		openerScope: page.url.pathname,
		returnFocusTo: (opener) => revealedProfileId ?? opener,
		emptyFallback: () =>
			wrapper?.querySelector<HTMLElement>('[data-slot="empty"] button') ??
			null,
	});

	export function focusFirstCard(): void {
		const first = profileIds[0];
		if (first !== undefined) void roving.focus({ key: first });
	}

	$effect(() => {
		if (roving.focusWithin && roving.activeKey !== null)
			gridState.keyboardStop = roving.activeKey;
	});

	$effect.pre(() => {
		gridState.load(geohash);
	});

	$effect(() => gridState.attachView());
</script>

<div
	bind:this={wrapper}
	{@attach roving.container}
	class="relative flex flex-1 flex-col"
>
	{#if empty && !gridState.loading && gridState.error}
		<div class="flex flex-1 p-4">
			<ApiErrorDisplay
				error={gridState.error}
				onRetry={() => gridState.retry()}
				class="m-auto"
			/>
		</div>
	{:else if empty && !gridState.loading && !gridState.paging.running}
		<EmptyGrid />
	{:else}
		<div
			bind:this={gridElement}
			data-slot="grid-cells"
			class="photo-grid"
			style:padding-top="{view.paddingTopPx}px"
			style:padding-bottom="{view.paddingBottomPx}px"
			data-rows-above={view.hasRowsAbove || undefined}
			data-rows-below={view.hasRowsBelow || undefined}
		>
			{#if empty && gridState.loading}
				{#each Array.from({ length: PAGE_SKELETONS })}
					<GridCellSkeleton />
				{/each}
			{:else}
				{#each visibleProfiles as item (item.id)}
					{@const profileId = item.id}
					{#if item.type === "rendered"}
						<GridProfileMiniCard
							{@attach roving.item(profileId)}
							id={item.id}
							displayName={item.displayName}
							distance={item.distance}
							unread={item.unread}
							onlineUntil={item.onlineUntil}
							isFavorite={item.isFavorite}
							isVisiting={item.isVisiting}
							hadRecentChat={item.hasChattedInLast24Hrs}
							rightNow={item.rightNow}
							medias={item.profilePhotosHashes?.map(
								(mediaHash) => ({ mediaHash }),
							) ?? []}
						/>
					{:else}
						<GridCellSkeleton
							{@attach roving.item(profileId)}
							role="link"
							aria-disabled="true"
							aria-busy="true"
							aria-label={t("browse.grid.a11y.loadingProfile")}
							onVisible={() => {
								gridState
									.resolveProfile(item.id)
									.catch((error) => console.error(error));
							}}
						/>
					{/if}
				{/each}
				{#each Array.from({ length: visibleSkeletons })}
					<GridCellSkeleton />
				{/each}
			{/if}
		</div>
	{/if}
	<div role="status" class="sr-only">
		{gridState.paging.running
			? t("browse.grid.a11y.loadingMore")
			: gridState.paging.failure
				? t("browse.grid.errors.loadMoreFailed")
				: ""}
	</div>
	{#if gridState.nextPage !== 0 && gridState.nextPage !== null}
		{#if gridState.paging.failure}
			<ApiErrorDisplay
				error={gridState.paging.failure}
				onRetry={() => gridState.paging.retry()}
			/>
		{/if}
		<PagingSentinel
			paging={gridState.paging}
			class="pointer-events-none absolute inset-x-0 bottom-0 h-px"
		/>
	{/if}
</div>
