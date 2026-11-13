<script lang="ts">
	import DropIcon from "phosphor-svelte/lib/DropIcon";

	import { Button } from "#lib/components/ui/button/index.ts";
	import * as Empty from "#lib/components/ui/empty/index.ts";
	import type { RightNowFeedFiltersState } from "./right-now-feed-filters-state.svelte";

	let { filters }: { filters: RightNowFeedFiltersState } = $props();
</script>

<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<DropIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>No posts found</Empty.Title>
		<Empty.Description>
			Try adjusting your filters or reset them to defaults.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex gap-2">
			<Button variant="outline" onclick={() => filters.resetFilters()}>
				Reset filters
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
