<script lang="ts">
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import {
		preferencesSnapshot,
		setPreferences,
	} from "#lib/app-data/preferences.svelte.ts";
	import {
		insideQuickFilterBar,
		quickFilterChips,
	} from "#lib/components/filters/quick-filter-chips.svelte.ts";
	import LocationChooser from "#lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { decodeGeohash } from "#lib/model/geohash.ts";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	const chips = insideQuickFilterBar() ? quickFilterChips() : undefined;
	const autoUpdatingId = $props.id();

	let pinPos: { lat: number; lon: number } | undefined = $state();
	let geoMapPickerOpen = $state(false);

	async function onSubmit(submission: {
		geohash: string;
		autoUpdateLocation: boolean;
	}) {
		try {
			await setPreferences(submission);
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("common.location.errors.saveFailed"),
				error,
			});
		}
	}

	function openPicker() {
		const geohash = preferencesSnapshot().geohash;
		pinPos = geohash ? decodeGeohash(geohash) : undefined;
		geoMapPickerOpen = true;
	}

	const autoUpdateLocation = $derived(
		preferencesSnapshot().autoUpdateLocation,
	);
</script>

<div class="relative flex shrink-0">
	<Button
		variant="secondary"
		class={[
			"relative w-11 overflow-clip transition-none *:absolute *:top-1/2 *:left-1/2 *:flex *:-translate-1/2 *:items-center *:justify-center *:gap-1.5 active:translate-y-px",
			className,
		]}
		aria-label={t("browse.locationChange.a11y.change")}
		aria-haspopup="dialog"
		aria-expanded={geoMapPickerOpen}
		aria-describedby={autoUpdateLocation ? autoUpdatingId : undefined}
		onclick={openPicker}
		{@attach chips?.chip("location")}
	>
		<MapPinIcon weight="fill" />
	</Button>
	{#if autoUpdateLocation}
		<span
			data-slot="tracking-dot"
			class="pointer-events-none absolute inset-e-1.5 top-1.5 size-1 rounded-full bg-destructive"
		>
			<span id={autoUpdatingId} hidden>
				{t("browse.locationChange.a11y.autoUpdating")}
			</span>
		</span>
	{/if}
</div>
<LocationChooser {onSubmit} bind:open={geoMapPickerOpen} bind:pinPos />
