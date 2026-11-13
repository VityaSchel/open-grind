<script lang="ts">
	import FunnelIcon from "phosphor-svelte/lib/FunnelIcon";

	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
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
		if (ownPostRunning) return "No one else nearby is on Right Now.";
		if (joinable)
			return "No one nearby is on Right Now. Join to be the first.";
		return "No one nearby is on Right Now.";
	});
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<Icon weight="fill" />
		</Empty.Media>
		{#if filtered}
			<Empty.Title>No Results</Empty.Title>
			<Empty.Description>No posts match these filters.</Empty.Description>
		{:else}
			<Empty.Title>No Posts Yet</Empty.Title>
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
					Reset filters
				</Button>
			</div>
		</Empty.Content>
	{/if}
</Empty.Root>
