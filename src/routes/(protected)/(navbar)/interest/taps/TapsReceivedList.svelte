<script lang="ts">
	import { onDestroy, untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import DataRefreshControl from "$lib/components/DataRefreshControl.svelte";
	import Skeleton from "$lib/components/ui/skeleton/skeleton.svelte";
	import EmptyTapsList from "./EmptyTapsList.svelte";
	import TapReceivedProfile from "./TapReceivedProfile.svelte";
	import { TapsState } from "./taps-state.svelte";

	let {
		ourProfileId,
		class: className,
	}: {
		ourProfileId: number;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const taps = untrack(() => new TapsState({ ourProfileId }));
	onDestroy(() => taps.destroy());

	let container: HTMLDivElement | null = $state(null);

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) taps.loadMore();
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

<div
	bind:this={container}
	class={["flex min-w-list-rail flex-1 flex-col gap-1", className]}
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
		<DataRefreshControl
			{container}
			windowScroll
			updating={taps.refreshing}
			position="top"
			class="mb-3"
			onclick={() => void taps.refresh()}
		/>
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
