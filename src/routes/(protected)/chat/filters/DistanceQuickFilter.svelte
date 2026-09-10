<script lang="ts">
	import { untrack } from "svelte";

	import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
	import {
		closestMaxDistanceStep,
		DEFAULT_MAX_DISTANCE_STEP,
		maxDistanceLabel,
		maxDistanceMetres,
	} from "$lib/components/filters/distance/distance-steps";
	import DistanceFilterSlider from "$lib/components/filters/distance/DistanceFilterSlider.svelte";
	import FilterDrawer from "$lib/components/filters/FilterDrawer.svelte";

	let {
		open = $bindable(),
		distanceMetres,
		onapply,
	}: {
		open: boolean;
		distanceMetres: number | null;
		onapply: (distanceMetres: number | null) => void;
	} = $props();

	const units = $derived(getPreferencesSnapshot().units);

	let enabled = $state(false);
	let step = $state(DEFAULT_MAX_DISTANCE_STEP);

	$effect(() => {
		if (!open) return;
		untrack(() => {
			enabled = distanceMetres !== null;
			step =
				distanceMetres === null
					? DEFAULT_MAX_DISTANCE_STEP
					: closestMaxDistanceStep({ metres: distanceMetres, units });
		});
	});
</script>

<FilterDrawer
	bind:open
	bind:enabled
	title="Distance"
	switchLabel="Filter by distance"
	onreset={() => (step = DEFAULT_MAX_DISTANCE_STEP)}
	onapply={() => onapply(enabled ? maxDistanceMetres({ step, units }) : null)}
>
	<div class="mb-2 w-full text-center">
		{maxDistanceLabel({ step, units })}
	</div>
	<DistanceFilterSlider
		bind:value={
			() => step,
			(next: number) => {
				enabled = true;
				step = next;
			}
		}
	/>
</FilterDrawer>
