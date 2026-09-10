<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		preferencesLoaded,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import {
		BACKDROP_BLUR_QUALITY_DESCRIPTIONS,
		BACKDROP_BLUR_QUALITY_LABELS,
		BACKDROP_BLUR_QUALITY_ORDER,
		type BackdropBlurQuality,
		UNCALIBRATED_BACKDROP_BLUR_QUALITY,
	} from "$lib/blur/quality";
	import {
		backdropBlurRenderable,
		backdropBlurTrialPending,
		settledBackdropBlurQuality,
	} from "$lib/blur/quality.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Slider } from "$lib/components/ui/slider";

	const supported = $derived(backdropBlurRenderable());
	let pending = $state<BackdropBlurQuality | null>(null);
	const chosen = $derived(
		pending ?? getPreferencesSnapshot().backdropBlurQuality,
	);
	const effective = $derived(settledBackdropBlurQuality());
	const trialPending = $derived(backdropBlurTrialPending());
	const quality = $derived(supported ? (chosen ?? effective) : effective);
	const position = $derived(BACKDROP_BLUR_QUALITY_ORDER.indexOf(quality));
	const automatic = $derived(supported && chosen === null);

	const lastStep = BACKDROP_BLUR_QUALITY_ORDER.length - 1;

	function stepCenter(step: number) {
		const travel = `(100% - var(--slider-thumb-size))`;
		return `calc(var(--slider-thumb-size) / 2 + ${step} * ${travel} / ${lastStep})`;
	}

	function choose(next: number) {
		const backdropBlurQuality =
			BACKDROP_BLUR_QUALITY_ORDER[next] ??
			UNCALIBRATED_BACKDROP_BLUR_QUALITY;
		pending = backdropBlurQuality;
		setPreferences({ backdropBlurQuality }).catch((error) => {
			pending = null;
			showErrorToast({ label: "Failed to save preferences", error });
		});
	}
</script>

<Item.Root variant="outline" class="gap-3 p-4">
	<Item.Content class="gap-1">
		<Item.Title>Background blur</Item.Title>
		<Item.Description>
			{BACKDROP_BLUR_QUALITY_DESCRIPTIONS[quality]}
		</Item.Description>
	</Item.Content>
	<Slider
		type="single"
		class="w-full"
		min={0}
		max={lastStep}
		step={1}
		disabled={!preferencesLoaded() || !supported}
		thumbLabels={["Background blur"]}
		thumbValueTexts={[BACKDROP_BLUR_QUALITY_LABELS[quality]]}
		bind:value={() => position, choose}
	/>
	<div aria-hidden="true" class="relative h-4 w-full text-xs">
		{#each BACKDROP_BLUR_QUALITY_ORDER as option, step (option)}
			<span
				data-slot="blur-step-label"
				class={[
					"absolute -translate-x-1/2 whitespace-nowrap",
					{
						"font-medium text-foreground": option === quality,
						"text-muted-foreground": option !== quality,
					},
				]}
				style:left={stepCenter(step)}
			>
				{BACKDROP_BLUR_QUALITY_LABELS[option]}
			</span>
		{/each}
	</div>
	{#if !supported}
		<Item.Description class="w-full">
			This system cannot blur backgrounds, so blur is always off.
		</Item.Description>
	{:else if automatic}
		<Item.Description class="w-full">
			{#if trialPending}
				Being chosen automatically as you scroll.
			{:else}
				Chosen automatically for this device.
			{/if}
		</Item.Description>
	{/if}
</Item.Root>
