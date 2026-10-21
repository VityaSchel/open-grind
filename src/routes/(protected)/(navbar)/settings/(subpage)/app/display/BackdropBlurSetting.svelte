<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import {
		preferencesLoaded,
		preferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import {
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
	import { type PlainMessageKey, t } from "$lib/i18n";

	const qualityKeys = {
		off: "settings.app.backdropBlur.quality.off",
		min: "settings.app.backdropBlur.quality.min",
		medium: "settings.app.backdropBlur.quality.medium",
		max: "settings.app.backdropBlur.quality.max",
	} as const satisfies Record<BackdropBlurQuality, PlainMessageKey>;

	const descriptionKeys = {
		off: "settings.app.backdropBlur.description.off",
		min: "settings.app.backdropBlur.description.min",
		medium: "settings.app.backdropBlur.description.medium",
		max: "settings.app.backdropBlur.description.max",
	} as const satisfies Record<BackdropBlurQuality, PlainMessageKey>;

	const supported = $derived(backdropBlurRenderable());
	let pending = $state<BackdropBlurQuality | null>(null);
	const chosen = $derived(
		pending ?? preferencesSnapshot().backdropBlurQuality,
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
			showErrorToast({
				label: t("settings.setting.errors.saveFailed"),
				error,
			});
		});
	}
</script>

<Item.Root variant="outline" class="gap-3 p-4">
	<Item.Content class="gap-1">
		<Item.Title>{t("settings.app.backdropBlur.title")}</Item.Title>
		<Item.Description>
			{t(descriptionKeys[quality])}
		</Item.Description>
	</Item.Content>
	<Slider
		type="single"
		class="w-full"
		min={0}
		max={lastStep}
		step={1}
		disabled={!preferencesLoaded() || !supported}
		thumbLabels={[t("settings.app.backdropBlur.title")]}
		thumbValueTexts={[t(qualityKeys[quality])]}
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
				{t(qualityKeys[option])}
			</span>
		{/each}
	</div>
	{#if !supported}
		<Item.Description class="w-full">
			{t("settings.app.backdropBlur.unsupported")}
		</Item.Description>
	{:else if automatic}
		<Item.Description class="w-full">
			{#if trialPending}
				{t("settings.app.backdropBlur.trialPending")}
			{:else}
				{t("settings.app.backdropBlur.automatic")}
			{/if}
		</Item.Description>
	{/if}
</Item.Root>
