<script lang="ts">
	import { MapPinIcon } from "phosphor-svelte";

	import { showErrorToast } from "$lib/api/error";
	import {
		getGeohashSnapshot,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import { decodeGeohash } from "$lib/model/geohash";

	let {
		class: className,
	}: {
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let pinPos: { lat: number; lon: number; zoom: number } | undefined = $state();
	let geoMapPickerOpen = $state(false);

	async function onSubmit(geohash: string) {
		try {
			await setPreferences({ geohash });
			geoMapPickerOpen = false;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to save location",
				error,
			});
		}
	}

	function openPicker() {
		const geohash = getGeohashSnapshot();
		pinPos = geohash
			? {
					...decodeGeohash(geohash),
					zoom: 17,
				}
			: undefined;
		geoMapPickerOpen = true;
	}

	let locationChooser: LocationChooser;

	$effect(() => {
		if (geoMapPickerOpen && pinPos) locationChooser.centerAt(pinPos);
	});
</script>

<Button
	variant="secondary"
	class={[
		"relative w-11 overflow-clip transition-none *:absolute *:top-1/2 *:left-1/2 *:flex *:-translate-1/2 *:items-center *:justify-center *:gap-1.5",
		className,
	]}
	onclick={openPicker}
>
	<MapPinIcon weight="fill" />
</Button>
<LocationChooser
	{onSubmit}
	bind:open={geoMapPickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
