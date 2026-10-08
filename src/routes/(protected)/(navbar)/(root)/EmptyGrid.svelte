<script lang="ts">
	import EmptyIcon from "phosphor-svelte/lib/EmptyIcon";
	import FunnelIcon from "phosphor-svelte/lib/FunnelIcon";
	import StarIcon from "phosphor-svelte/lib/StarIcon";

	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { sentFilterKeys } from "$lib/grid/grid-query";
	import { gridState } from "$lib/grid/grid-state.svelte";
	import { t } from "$lib/i18n";
	import { defaultFilters } from "$lib/model/browse/grid/filters";

	const sentFilters = $derived(
		sentFilterKeys(gridState.filters.value ?? defaultFilters),
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
			<Empty.Title>{t("browse.grid.empty.noProfiles.title")}</Empty.Title>
			<Empty.Description>
				{t("browse.grid.empty.noProfiles.description")}
			</Empty.Description>
		{:else if otherFilters}
			<Empty.Title>{t("common.filters.noResults")}</Empty.Title>
			<Empty.Description>
				{t("browse.grid.empty.noMatchingFavorites.description")}
			</Empty.Description>
		{:else}
			<Empty.Title>
				{t("browse.grid.empty.noFavorites.title")}
			</Empty.Title>
			<Empty.Description>
				{t("browse.grid.empty.noFavorites.description")}
			</Empty.Description>
		{/if}
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			<Button
				variant="outline"
				onclick={() => gridState.filters.resetFilters()}
			>
				{t("browse.grid.empty.resetFilters")}
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
