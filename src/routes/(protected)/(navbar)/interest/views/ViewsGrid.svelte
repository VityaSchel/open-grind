<script lang="ts">
	import { onDestroy, untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import EmptyViewsGrid from "./EmptyViewsGrid.svelte";
	import ViewedPreview from "./ViewedPreview.svelte";
	import ViewedProfile from "./ViewedProfile.svelte";
	import { ViewsState } from "./views-state.svelte";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const views = untrack(() => new ViewsState());
	onDestroy(() => views.destroy());

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) views.loadMore();
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

<div class={["flex flex-1 flex-col", className]}>
	{#if views.loading}
		<div class="views-grid">
			{#each Array(12)}
				<div class="aspect-square animate-pulse bg-neutral-700"></div>
			{/each}
		</div>
	{:else if views.error}
		<div class="flex flex-1">
			<ApiErrorDisplay error={views.error} class="m-auto" />
		</div>
	{:else if views.views.length === 0}
		<EmptyViewsGrid />
	{:else}
		<div class="views-grid">
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

<style lang="postcss">
	@reference "$layout";

	.views-grid {
		@apply grid grid-cols-3 gap-0.5 xs:grid-cols-4;
	}
</style>
