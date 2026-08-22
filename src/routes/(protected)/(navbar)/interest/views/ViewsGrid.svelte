<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
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

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce(() => container, views);
</script>

<div class="screen-nav-host">
	<div
		bind:this={container}
		class="pull-scroller"
		onscroll={() => (views.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			class="@container/photo-grid mx-auto flex min-h-overscrollable w-full max-w-120 flex-col gap-3 px-4 pt-16 pb-nav-clear"
		>
			{#if views.loading}
				<div class="photo-grid">
					{#each Array(24)}
						<Skeleton class="aspect-square rounded-none" />
					{/each}
				</div>
			{:else if views.error}
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
				<div class="photo-grid">
					{#each views.views as entry (entry.key)}
						{#if entry.type === "profile"}
							<ViewedProfile view={entry.profile} />
						{:else}
							<ViewedPreview preview={entry.preview} />
						{/if}
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
	{#if !views.loading && !views.error}
		<DataRefreshControl
			{container}
			updating={views.refreshing}
			position="top"
			onrefresh={() => void views.refresh()}
		/>
	{/if}
</div>
