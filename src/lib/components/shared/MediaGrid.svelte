<script lang="ts" generics="T">
	import type { Snippet } from "svelte";

	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import type { SelectionSet } from "$lib/util/selection.svelte";

	let {
		items,
		key,
		empty,
		error,
		onRetry,
		skeletons,
		selected,
		gridClass,
		emptyState,
		leading,
		tile,
	}: {
		items: T[] | null;
		key: (item: T) => unknown;
		empty: boolean;
		error: unknown;
		onRetry: () => void;
		skeletons: number;
		selected?: SelectionSet<unknown>;
		gridClass?: import("svelte/elements").ClassValue;
		emptyState?: Snippet;
		leading?: Snippet;
		tile: Snippet<[T, number]>;
	} = $props();
</script>

<div class="@container/photo-grid flex flex-col rounded-grid">
	{#if error !== null}
		<div class="flex flex-1">
			<ApiErrorDisplay {error} {onRetry} class="m-auto" />
		</div>
	{:else if items === null}
		<div class={["photo-grid", gridClass]}>
			{#each Array(skeletons)}
				<MediaImage
					src={null}
					pending
					class="aspect-(--photo-grid-aspect)"
				/>
			{/each}
		</div>
	{:else if empty}
		{@render emptyState?.()}
	{:else}
		<div class={["photo-grid", gridClass]}>
			{@render leading?.()}
			{#each items as item, index (key(item))}
				{@render tile(item, index)}
			{/each}
		</div>
	{/if}
	{#if selected}
		<div role="status" class="sr-only">
			{selected.size === selected.max
				? `Maximum ${selected.max} selected`
				: ""}
		</div>
	{/if}
</div>
