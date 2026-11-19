<script module lang="ts">
	let lastColumns: number | null = null;
</script>

<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "#lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "#lib/components/feedback/DataRefreshControl.svelte";
	import ScrollToTopButton from "#lib/components/shared/ScrollToTopButton.svelte";
	import { Skeleton } from "#lib/components/ui/skeleton/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { observeIntersection } from "#lib/util/observe-intersection.ts";
	import {
		gridColumns,
		RovingFocusState,
	} from "#lib/util/roving-focus-state.svelte.ts";
	import { restoreScrollOnce } from "#lib/util/scroll-restore.svelte.ts";
	import EmptyViewsGrid from "./EmptyViewsGrid.svelte";
	import UntrackedViewsGrid from "./UntrackedViewsGrid.svelte";
	import ViewedPreview from "./ViewedPreview.svelte";
	import ViewedProfile from "./ViewedProfile.svelte";
	import { getViewsState } from "./views-state.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const views = untrack(() => {
		const state = getViewsState(ourProfileId);
		state.load();
		return state;
	});

	const grid = new RovingFocusState({
		keys: () => views.views.map(({ key }) => key),
		orientation: "grid",
		wrap: "rows",
		cells: (item) => [
			item.querySelector<HTMLElement>(':scope > :is(a, [role="img"])') ??
				item,
		],
		consumeAtEdge: ["left", "right"],
		openerScope: "/interest/views",
	});

	let container: HTMLDivElement | null = $state(null);
	let columns = $state(lastColumns);

	const rows = $derived.by(() => {
		if (columns === null) return [];
		const perRow = columns;
		return Array.from(
			{ length: Math.ceil(views.views.length / perRow) },
			(_, index) => ({
				index,
				entries: views.views.slice(
					index * perRow,
					(index + 1) * perRow,
				),
			}),
		);
	});

	restoreScrollOnce({ container: () => container, state: views });

	function followColumns(grid: HTMLElement) {
		const measure = () => {
			const measured = Math.max(1, gridColumns(grid));
			lastColumns = measured;
			columns = measured;
		};
		measure();
		const resize = new ResizeObserver(measure);
		resize.observe(grid);
		return () => resize.disconnect();
	}
</script>

<div class="screen-nav-host">
	{#if !views.loading && (views.views.length > 0 || !views.error)}
		<DataRefreshControl
			{container}
			updating={views.refreshing}
			failed={views.refreshFailed}
			position="top"
			onrefresh={() => void views.refresh()}
		/>
	{/if}
	<div
		bind:this={container}
		data-slot="views-scroller"
		class="pull-scroller scroll-pt-header-clear-16 scroll-pb-nav-clear overscroll-x-auto"
		onscroll={() => (views.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			data-refresh-content
			class="@container/photo-grid mx-auto min-h-overscrollable flex w-full max-w-120 flex-col gap-3 px-4 pt-header-clear-16 pb-nav-clear"
		>
			{#if views.loading}
				<div class="photo-grid">
					{#each Array(24)}
						<Skeleton class="aspect-square rounded-none" />
					{/each}
				</div>
			{:else if views.error && views.views.length === 0}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={views.error}
						onRetry={() => views.retry()}
						class="m-auto"
					/>
				</div>
			{:else if views.views.length === 0 && views.viewedMeHidden}
				<UntrackedViewsGrid
					enabling={views.enablingViewedMe}
					onEnable={() => void views.enableViewedMeTracking()}
				/>
			{:else if views.views.length === 0}
				<EmptyViewsGrid />
			{:else}
				<div
					role="grid"
					aria-label={t("interest.tabs.views")}
					aria-rowcount={views.hasMore ? -1 : undefined}
					class="photo-grid"
					{@attach grid.container}
					{@attach followColumns}
				>
					{#each rows as row (row.index)}
						<div role="row" class="row contents">
							{#each row.entries as entry (entry.key)}
								{#if entry.type === "profile"}
									<ViewedProfile
										role="gridcell"
										view={entry.profile}
										{@attach grid.item(entry.key)}
									/>
								{:else}
									<ViewedPreview
										role="gridcell"
										preview={entry.preview}
										{@attach grid.item(entry.key)}
									/>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
				{#if views.hasMore}
					<div
						class="h-0"
						use:observeIntersection={{
							handle: () => views.loadMore(),
							rootMargin: "400px",
						}}
					></div>
				{/if}
			{/if}
		</div>
	</div>
	<ScrollToTopButton
		{container}
		class="bottom-nav-clear"
		onjump={({ keyboardFocused }) => {
			if (keyboardFocused) void grid.focusFirst();
		}}
	/>
</div>
