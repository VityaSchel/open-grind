<script lang="ts">
	import isEqual from "lodash-es/isEqual";
	import { onMount, untrack } from "svelte";
	import { expoOut } from "svelte/easing";
	import { Tween } from "svelte/motion";

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

	let expanded = $state(false);
	let expansion = new Tween(0, { duration: 600, easing: expoOut });

	let from: HTMLDivElement;
	let to: HTMLDivElement;
	let fromPos = $state({ left: 0, top: 0 });
	let toPos = $state({ left: 0, top: 0 });

	$effect(() => {
		if (expansion.current === expansion.target) return;
		untrack(() => {
			const fromRect = from.getBoundingClientRect();
			const toRect = to.getBoundingClientRect();
			fromPos = {
				left: fromRect.left,
				top: fromRect.top,
			};
			toPos = {
				left: toRect.left + 16,
				top: toRect.top,
			};
		});
	});

	let lastScrollY: number = $state(0);

	onMount(() => {
		expansion
			.set(window.scrollY > 0 ? 0 : 1, {
				duration: 0,
			})
			.catch((error) => {
				console.error("Failed to set initial expansion state", error);
			});
		lastScrollY = window.scrollY;
	});

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

<svelte:window
	onscroll={() => {
		expanded = window.scrollY - lastScrollY < 0;
		expansion.target = expanded ? 1 : 0;
		fromPos = from.getBoundingClientRect();
		toPos = to.getBoundingClientRect();
		lastScrollY = window.scrollY;
	}}
/>
<ProgressiveBlur
	class="fixed top-0 left-0 w-full z-10"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex flex-col pt-[calc(1rem+var(--safe-area-top))]"
	direction="topToBottom"
>
	<div
		class="overflow-hidden px-4"
		style="height: {expansion.current * 40}px; opacity: {expansion.current === 1
			? '1'
			: '0'}; pointer-events: {expansion.current > 0.5 ? 'auto' : 'none'};"
		bind:this={to}
	>
		<LocationChange expansion={1} onUpdate={onUpdatePreferences} />
	</div>

	<div class="flex overflow-x-auto scrollbar-thin p-4 pt-0 gap-0.5">
		{#if expansion.current > 0 && expansion.current < 1}
			<div
				class="absolute w-[calc(100%-16px-16px)] pointer-events-none"
				style="left: {fromPos.left +
					(toPos.left - fromPos.left) *
						expansion.current}px; top: {fromPos.top +
					(toPos.top - fromPos.top) * expansion.current}px;"
			>
				<LocationChange expansion={expansion.current} class="relative" />
			</div>
		{/if}
		<div
			class="shrink-0 overflow-hidden"
			style="width: {(1 - expansion.current) *
				44}px; opacity: {expansion.current === 0
				? '1'
				: '0'}; pointer-events: {expansion.current < 0.5 ? 'auto' : 'none'};"
			bind:this={from}
		>
			<LocationChange expansion={0} onUpdate={onUpdatePreferences} />
		</div>
		<QuickFilters bind:openFilters bind:filters {onUpdateFilters} />
	</div>
</ProgressiveBlur>
<div class="h-20"></div>
<GridFilters bind:filters bind:open={openFilters.all} {onUpdateFilters} />
