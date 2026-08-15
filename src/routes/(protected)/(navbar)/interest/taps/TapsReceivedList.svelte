<script lang="ts">
	import { untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import { getTapsState } from "$lib/interest/taps-state.svelte";
	import { observeIntersection } from "$lib/util/observe-intersection";
	import { restoreScrollOnce } from "$lib/util/scroll-restore.svelte";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";

	let { ourProfileId }: { ourProfileId: number } = $props();

	const taps = untrack(() => {
		const state = getTapsState(ourProfileId);
		state.load();
		return state;
	});

	$effect(() => {
		if (taps.hasUnseen) taps.markViewed();
	});

	let container: HTMLDivElement | null = $state(null);

	restoreScrollOnce(() => container, taps);
</script>

<div class="screen-nav-host">
	<div
		bind:this={container}
		class="pull-scroller"
		onscroll={() => (taps.scrollY = container?.scrollTop ?? 0)}
	>
		<div
			class="mx-auto flex min-h-overscrollable w-full max-w-120 flex-col gap-1 px-4 pt-16 pb-nav-clear"
		>
			{#if taps.loading}
				{#each Array(8)}
					<Skeleton class="h-24.5 w-full shrink-0" />
				{/each}
			{:else if taps.error}
				<div class="flex flex-1">
					<ApiErrorDisplay
						error={taps.error}
						onRetry={() => taps.retry()}
						class="m-auto"
					/>
				</div>
			{:else}
				{#each taps.taps as tap (tap.profileId)}
					<TapReceivedProfile {tap} />
				{:else}
					<EmptyTapsList />
				{/each}
				{#if taps.hasMore}
					<div
						class="h-0"
						use:observeIntersection={{
							handle: () => taps.loadMore(),
							rootMargin: "400px",
						}}
					></div>
				{/if}
			{/if}
		</div>
	</div>
	{#if !taps.loading && !taps.error}
		<DataRefreshControl
			{container}
			updating={taps.refreshing}
			position="top"
			onrefresh={() => void taps.refresh()}
		/>
	{/if}
</div>
