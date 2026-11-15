<script lang="ts">
	import FunnelIcon from "phosphor-svelte/lib/FunnelIcon";

	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { rightNowFeedQuery } from "./feed-query";
	import type { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";

	let {
		filters,
		ownPostRunning,
		joinable,
	}: {
		filters: RightNowFeedFiltersState;
		ownPostRunning: boolean;
		joinable: boolean;
	} = $props();

	const query = $derived(rightNowFeedQuery(filters.current));
	const filtered = $derived(
		query.hosting !== undefined ||
			query.ageMin !== undefined ||
			query.ageMax !== undefined ||
			query.sexualPositions !== undefined,
	);
	const Icon = $derived(filtered ? FunnelIcon : SplashIcon);
	const nobodyDescription = $derived.by(() => {
		if (ownPostRunning) return t("browse.rightNow.empty.noPosts.noOneElse");
		if (joinable) return t("browse.rightNow.empty.noPosts.joinFirst");
		return t("browse.rightNow.empty.noPosts.description");
	});
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight="fill" />
		</Empty.Media>
		{#if filtered}
			<Empty.Title>{t("common.filters.noResults")}</Empty.Title>
			<Empty.Description>
				{t("browse.rightNow.empty.noResults.description")}
			</Empty.Description>
		{:else}
			<Empty.Title>
				{t("browse.rightNow.empty.noPosts.title")}
			</Empty.Title>
			<Empty.Description>{nobodyDescription}</Empty.Description>
		{/if}
	</Empty.Header>
	{#if filtered}
		<Empty.Content>
			<div class="flex gap-2">
				<Button
					variant="outline"
					onclick={() => filters.resetFilters()}
				>
					{t("browse.grid.empty.resetFilters")}
				</Button>
			</div>
		</Empty.Content>
	{/if}
</Empty.Root>
