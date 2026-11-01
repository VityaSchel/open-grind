<script lang="ts">
	import EmptyIcon from "phosphor-svelte/lib/EmptyIcon";
	import FunnelIcon from "phosphor-svelte/lib/FunnelIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import { genderFilterFlag } from "$lib/api/feature-flags-state.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { sentFilterKeys } from "$lib/grid/grid-query";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { defaultFilters } from "$lib/model/browse/grid/filters";

	const sentFilters = $derived(
		sentFilterKeys({
			filters: gridState.filters.value ?? defaultFilters,
			genderFilterFlag: genderFilterFlag(),
		}),
	);
	const favorites = $derived(sentFilters.some((key) => key === "favorites"));
	const otherFilters = $derived(
		sentFilters.some((key) => key !== "favorites"),
	);
	const Icon = $derived.by(() => {
		if (!favorites) return EmptyIcon;
		return otherFilters ? FunnelIcon : StarIcon;
	});
</script>

<Empty.Root class="col-span-full">
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight={favorites ? "fill" : "regular"} />
		</Empty.Media>
		{#if !favorites}
			<Empty.Title>No Profiles Found</Empty.Title>
			<Empty.Description>
				Try adjusting your filters or reset them to defaults.
			</Empty.Description>
		{:else if otherFilters}
			<Empty.Title>No Results</Empty.Title>
			<Empty.Description>
				No favorites match these filters.
			</Empty.Description>
		{:else}
			<Empty.Title>No Favorites Yet</Empty.Title>
			<Empty.Description>
				Tap the star on someone's profile to save them here.
			</Empty.Description>
		{/if}
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => gridState.filters.resetFilters()}
			>
				Reset filters
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
