<script module lang="ts">
	let savedScrollY = 0;
</script>

<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { onDestroy, tick, untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { nearestScrollableAncestor } from "$lib/components/feedback/refresh/scroll-chain";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import EmptyViewsGrid from "./EmptyViewsGrid.svelte";
	import ViewedPreview from "./ViewedPreview.svelte";
	import ViewedProfile from "./ViewedProfile.svelte";
	import { ViewsState } from "./views-state.svelte";

	const views = untrack(() => new ViewsState());
	onDestroy(() => views.destroy());

	let container: HTMLDivElement | null = $state(null);

	beforeNavigate(() => {
		if (container) savedScrollY = container.scrollTop;
	});

	let scrollRestored = false;
	$effect(() => {
		if (scrollRestored || !container || views.loading || views.error) return;
		scrollRestored = true;
		const el = container;
		const target = savedScrollY;
		// Restoring scroll against the empty skeleton frame would clamp the target to 0
		if (target > 0) void tick().then(() => (el.scrollTop = target));
	});

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) views.loadMore();
			},
			{ root: nearestScrollableAncestor(node), rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

<div class="screen-nav-host">
	<div bind:this={container} class="pull-scroller">
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
					<div class="h-0" use:observeSentinel></div>
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
