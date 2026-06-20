<script lang="ts">
	import isEqual from "lodash-es/isEqual";
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import { defaultFilters } from "$lib/components/filters/filters";
	import ProgressiveBlur from "$lib/components/ProgressiveBlur.svelte";
	import GridFilters from "../GridFilters.svelte";
	import LocationChange from "../LocationChange.svelte";
	import QuickFilters from "./QuickFilters.svelte";

	let {
		onUpdatePreferences,
		onRefreshGrid,
	}: {
		onUpdatePreferences: () => void;
		onRefreshGrid: () => void;
	} = $props();

	let openFilters = $state({
		all: false,
		age: false,
		position: false,
	});

	let filters = $state(defaultFilters);

	onMount(() => {
		getPreferences()
			.then(({ gridSearchFilters: preferredFilters = defaultFilters }) => {
				filters = preferredFilters;
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({
					label: "Failed to load filters",
					error,
				});
			});
	});

	async function onUpdateFilters() {
		try {
			const { gridSearchFilters: oldFilters = defaultFilters } =
				await getPreferences();
			if (!isEqual(oldFilters, filters)) {
				await setPreferences({
					gridSearchFilters: filters,
				});
				onRefreshGrid();
			}
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to update filters",
				error,
			});
		}
	}

	export function resetFilters() {
		filters = defaultFilters;
		void onUpdateFilters();
	}
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
		<QuickFilters bind:openFilters bind:filters {onUpdateFilters} />
	</div>
</ProgressiveBlur>
<div class="h-9"></div>
<GridFilters bind:filters bind:open={openFilters.all} {onUpdateFilters} />
