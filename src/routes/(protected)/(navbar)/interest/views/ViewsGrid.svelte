<script lang="ts">
	import { onDestroy, untrack } from "svelte";

	import ApiErrorDisplay from "$lib/components/ApiErrorDisplay.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
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
		<div class="profile-grid">
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
		<div class="profile-grid">
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
