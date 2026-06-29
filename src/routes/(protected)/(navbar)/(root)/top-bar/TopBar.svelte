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
	} = $props();

	let openFilters = $state({
		all: false,
		age: false,
		position: false,
	});
</script>

<ProgressiveBlur
	data-fixed-header
	class="fixed top-0 left-0 z-10 w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-fixed-header"
	direction="topToBottom"
>
	<div class="scrollbar-thin flex gap-0.5 overflow-x-auto p-4 pt-0">
		<LocationChange onUpdate={onUpdatePreferences} />
		<QuickFilters bind:openFilters />
		<CommandCenterTrigger />
	</div>
</ProgressiveBlur>
<div class="h-9"></div>
<GridFilters bind:open={openFilters.all} />
