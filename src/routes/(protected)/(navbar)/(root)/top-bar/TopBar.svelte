<script lang="ts">
	import CommandCenterTrigger from "$lib/components/command-center/CommandCenterTrigger.svelte";
	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let {
		onUpdatePreferences,
	}: {
		onUpdatePreferences: () => void;
		onRefreshGrid: () => void;
	} = $props();

	let openFilters = $state({
		all: false,
		age: false,
		position: false,
	});
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 w-full z-10"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-[calc(1rem+var(--safe-area-top))]"
	direction="topToBottom"
>
	<div class="flex overflow-x-auto scrollbar-thin p-4 pt-0 gap-0.5">
		<LocationChange onUpdate={onUpdatePreferences} />
		<QuickFilters bind:openFilters />
		<CommandCenterTrigger />
	</div>
</ProgressiveBlur>
<div class="h-9"></div>
<GridFilters bind:open={openFilters.all} />
