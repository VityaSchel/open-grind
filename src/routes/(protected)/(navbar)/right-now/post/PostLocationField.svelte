<script lang="ts">
	import { expoOut } from "svelte/easing";

	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import { Slider } from "#lib/components/ui/slider/index.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { slide } from "#lib/util/reduced-motion.ts";
	import { formatDistance } from "#lib/util/units.ts";
	import {
		approximateRadiusMeters,
		LEAST_PRECISE_RADIUS,
		type PostForm,
		showsOnMap,
	} from "./post-form";

	let {
		shareLocation = $bindable(),
		locationRadius = $bindable(),
		disabled = false,
	}: {
		shareLocation: PostForm["shareLocation"];
		locationRadius: number;
		disabled?: boolean;
	} = $props();

	const showOnMap = $derived(showsOnMap({ shareLocation }));
	const units = $derived(preferencesSnapshot().units);
	const radiusLabel = $derived(
		`Within about ${formatDistance(approximateRadiusMeters({ locationRadius }), units)}`,
	);
</script>

<div data-slot="post-location" class="overflow-hidden rounded-xl border">
	<SwitchField
		title="Show me on map"
		class="rounded-none border-0"
		{disabled}
		bind:checked={
			() => showOnMap,
			(next: boolean) => {
				shareLocation = next ? "DISTANCE_AND_MAP" : "NONE";
				if (next) locationRadius = LEAST_PRECISE_RADIUS;
			}
		}
	/>
	{#if showOnMap}
		<div
			data-slot="post-location-accuracy"
			transition:slide={{ duration: 200, easing: expoOut }}
		>
			<div class="flex flex-col gap-3 border-t p-4">
				<div class="flex items-baseline justify-between gap-2 text-sm">
					<p class="font-medium">Location accuracy</p>
					<p
						data-slot="post-location-radius"
						class="text-muted-foreground tabular-nums"
					>
						{radiusLabel}
					</p>
				</div>
				<Slider
					type="single"
					class="w-full"
					min={0}
					max={LEAST_PRECISE_RADIUS}
					step={1}
					{disabled}
					thumbLabels={["Location accuracy"]}
					thumbValueTexts={[radiusLabel]}
					bind:value={locationRadius}
				/>
				<div
					aria-hidden="true"
					class="flex justify-between text-xs text-muted-foreground"
				>
					<span>More</span>
					<span>Less</span>
				</div>
			</div>
		</div>
	{/if}
</div>
