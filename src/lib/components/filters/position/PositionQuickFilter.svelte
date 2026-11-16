<script lang="ts">
	import { untrack } from "svelte";

	import FilterDrawer from "#lib/components/filters/FilterDrawer.svelte";
	import PositionFilterToggle from "#lib/components/filters/position/PositionFilterToggle.svelte";
	import { t } from "#lib/i18n/index.ts";
	import type { FilterPositionId } from "#lib/model/browse/grid/filters.ts";

	type PositionFilters = {
		positionEnabled: boolean;
		positions: FilterPositionId[];
	};

	let {
		open = $bindable(),
		filters,
	}: {
		open: boolean;
		filters: {
			snapshot(): PositionFilters;
			set(patch: PositionFilters): void;
		};
	} = $props();

	let draft = $state(untrack(() => filters.snapshot()));
	let { positionEnabled: enabled, positions: value } = $derived(draft);

	$effect(() => {
		if (open) {
			draft = untrack(() => filters.snapshot());
		}
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title={t("common.filters.position.label")}
	switchLabel={t("common.filters.position.a11y.toggle")}
	onreset={() => {
		value = [];
	}}
	onapply={() => filters.set({ positionEnabled: enabled, positions: value })}
>
	<PositionFilterToggle
		bind:value={
			() => value,
			(next: FilterPositionId[]) => {
				enabled = true;
				value = next;
			}
		}
	/>
</FilterDrawer>
