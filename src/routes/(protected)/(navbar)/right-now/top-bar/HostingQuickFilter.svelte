<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";
	import PersonSimpleWalkIcon from "phosphor-svelte/lib/PersonSimpleWalkIcon";
	import { untrack } from "svelte";

	import FilterDrawer from "#lib/components/filters/FilterDrawer.svelte";
	import RadioList from "#lib/components/shared/RadioList.svelte";
	import RadioListItem from "#lib/components/shared/RadioListItem.svelte";
	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { defaultRightNowFeedFilters } from "#lib/model/right-now/filters.ts";
	import type { RightNowFeedFiltersState } from "../right-now-feed-filters-state.svelte";

	let {
		open = $bindable(),
		filters,
	}: { open: boolean; filters: RightNowFeedFiltersState } = $props();

	const options = [
		{ value: "true", label: "Hosting", icon: HouseIcon },
		{ value: "false", label: "Not hosting", icon: PersonSimpleWalkIcon },
	];

	let draft = $state(untrack(() => filters.snapshot()));
	let { hostingEnabled: enabled, hosting: value } = $derived(draft);

	$effect(() => {
		if (open) {
			draft = untrack(() => filters.snapshot());
		}
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Hosting"
	switchLabel="Filter by hosting"
	onreset={() => {
		value = defaultRightNowFeedFilters.hosting;
	}}
	onapply={() => filters.set({ hostingEnabled: enabled, hosting: value })}
>
	<RadioList
		aria-label="Hosting"
		bind:value={
			() => String(value),
			(next: string) => {
				enabled = true;
				value = next === "true";
			}
		}
	>
		{#each options as { value: optionValue, label, icon: Icon } (optionValue)}
			<RadioListItem value={optionValue}>
				{#snippet children({ checked })}
					<Item.Media>
						<Icon class="size-5" />
					</Item.Media>
					<Item.Content>
						<Item.Title>{label}</Item.Title>
					</Item.Content>
					<Item.Actions>
						<RadioMark {checked} />
					</Item.Actions>
				{/snippet}
			</RadioListItem>
		{/each}
	</RadioList>
</FilterDrawer>
