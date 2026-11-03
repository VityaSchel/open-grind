<script lang="ts">
	import { preferencesSnapshot } from "#lib/app-data/preferences.svelte.ts";
	import { Slider } from "#lib/components/ui/slider/index.ts";
	import SwitchField from "#lib/components/ui/switch-field/SwitchField.svelte";
	import { formatDistance } from "#lib/util/units.ts";
	import { approximateRadiusMeters, LEAST_PRECISE_RADIUS } from "./post-form";

	let {
		showOnMap = $bindable(),
		locationRadius = $bindable(),
		disabled = false,
	}: {
		showOnMap: boolean;
		locationRadius: number;
		disabled?: boolean;
	} = $props();

	const units = $derived(preferencesSnapshot().units);
	const radiusLabel = $derived(
		`Within about ${formatDistance(approximateRadiusMeters({ locationRadius }), units)}`,
	);
</script>

<div class="flex flex-col gap-2">
	<SwitchField
		title="Show me on map"
		{disabled}
		bind:checked={
			() => showOnMap,
			(next: boolean) => {
				showOnMap = next;
				if (next) locationRadius = LEAST_PRECISE_RADIUS;
			}
		}
	/>
	{#if showOnMap}
		<div
			data-slot="post-location-accuracy"
			class="flex flex-col gap-3 rounded-xl border p-4"
		>
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
				bind:value={
					() => LEAST_PRECISE_RADIUS - locationRadius,
					(next: number) =>
						(locationRadius = LEAST_PRECISE_RADIUS - next)
				}
			/>
			<div
				aria-hidden="true"
				class="flex justify-between text-xs text-muted-foreground"
			>
				<span>Less</span>
				<span>More</span>
			</div>
		</div>
	{/if}
</div>
