<script module lang="ts">
	let savedScrollY = 0;
</script>

<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { onDestroy, tick, untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/feedback/DataRefreshControl.svelte";
	import { nearestScrollableAncestor } from "$lib/components/feedback/refresh/scroll-chain";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";
	import { TapsState } from "./taps-state.svelte";

	let {
		ourProfileId,
	}: {
		ourProfileId: number;
	} = $props();

	const taps = untrack(() => new TapsState({ ourProfileId }));
	onDestroy(() => taps.destroy());

	let container: HTMLDivElement | null = $state(null);

	beforeNavigate(() => {
		if (container) savedScrollY = container.scrollTop;
	});

	let scrollRestored = false;
	$effect(() => {
		if (scrollRestored || !container || taps.loading || taps.error) return;
		scrollRestored = true;
		const el = container;
		const target = savedScrollY;
		// Restoring scroll against the empty skeleton frame would clamp the target to 0
		if (target > 0) void tick().then(() => (el.scrollTop = target));
	});

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) taps.loadMore();
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

<div class="relative h-(--screen-nav) w-full -mb-(--content-pb)">
	<div
		bind:this={container}
		class="h-full w-full overflow-auto overscroll-contain"
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
					<div class="h-0" use:observeSentinel></div>
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
