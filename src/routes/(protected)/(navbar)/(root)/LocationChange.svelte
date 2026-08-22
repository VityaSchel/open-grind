<script lang="ts">
	import { MapPinIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import {
		getPreferencesSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import { PIN_ZOOM } from "$lib/components/location-chooser/constants";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import { decodeGeohash } from "$lib/model/geohash";

	let { class: className }: { class?: import("svelte/elements").ClassValue } =
		$props();

	let pinPos: { lat: number; lon: number; zoom: number } | undefined =
		$state();
	let geoMapPickerOpen = $state(false);

	async function onSubmit(submission: {
		geohash: string;
		autoUpdateLocation: boolean;
	}) {
		try {
			await setPreferences(submission);
			geoMapPickerOpen = false;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
		}
	}

	function openPicker() {
		const geohash = getPreferencesSnapshot().geohash;
		pinPos = geohash
			? { ...decodeGeohash(geohash), zoom: PIN_ZOOM }
			: undefined;
		geoMapPickerOpen = true;
		if (pinPos) locationChooser.centerAt(pinPos);
	}

	let locationChooser: LocationChooser;

	const autoUpdateLocation = $derived(
		getPreferencesSnapshot().autoUpdateLocation,
	);
</script>

<div class="relative flex shrink-0">
	<Button
		variant="secondary"
		class={[
			"relative w-11 overflow-clip transition-none *:absolute *:top-1/2 *:left-1/2 *:flex *:-translate-1/2 *:items-center *:justify-center *:gap-1.5",
			className,
		]}
		aria-label="Change location"
		onclick={openPicker}
	>
		<MapPinIcon weight="fill" />
	</Button>
	{#if autoUpdateLocation}
		<span
			data-slot="tracking-dot"
			class="pointer-events-none absolute inset-e-1.5 top-1.5 size-1 rounded-full bg-destructive"
		>
			<span class="sr-only">Location is updating automatically</span>
		</span>
	{/if}
</div>
<LocationChooser
	{onSubmit}
	bind:open={geoMapPickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
