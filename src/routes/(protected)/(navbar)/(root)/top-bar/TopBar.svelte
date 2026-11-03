<script lang="ts">
	import CommandCenterTrigger from "#lib/components/command-center/CommandCenterTrigger.svelte";
	import QuickFiltersBar from "#lib/components/filters/QuickFiltersBar.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let openFilters = $state({ all: false, age: false, position: false });
</script>

<QuickFiltersBar>
	<LocationChange />
	<QuickFilters bind:openFilters />
	<CommandCenterTrigger />
</QuickFiltersBar>
<GridFilters bind:open={openFilters.all} />
