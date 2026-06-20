<script lang="ts">
	import { MapPinIcon } from "phosphor-svelte";
	import { onMount } from "svelte";

	import { showErrorToast } from "$lib/api/error";
	import {
		getPreferences,
		setPreferences,
	} from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import { decodeGeohash } from "$lib/model/geohash";

	let {
		onUpdate,
		class: className,
	}: {
		onUpdate?: () => void;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	let pinPos: { lat: number; lon: number; zoom: number } | undefined = $state();
	let geoMapPickerOpen = $state(false);

	async function onSubmit(geohash: string) {
		try {
			await setPreferences({ geohash });
			geoMapPickerOpen = false;
			onUpdate?.();
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to save location",
				error,
			});
		}
	}

	onMount(() => {
		getPreferences()
			.then(({ geohash }) => {
				if (geohash) {
					pinPos = {
						...decodeGeohash(geohash),
						zoom: 17,
					};
				}
			})
			.catch((error) => {
				console.error(error);
				showErrorToast({
					label: "Failed to load location",
					error,
				});
				pinPos = undefined;
			});
	});

	let locationChooser: LocationChooser;

	$effect(() => {
		if (geoMapPickerOpen && pinPos) locationChooser.centerAt(pinPos);
	});
</script>

<Button
	variant="secondary"
	class={[
		"transition-none relative *:absolute *:top-1/2 *:left-1/2 *:-translate-1/2 *:flex *:items-center *:justify-center *:gap-1.5 overflow-clip w-11",
		className,
	]}
	onclick={() => (geoMapPickerOpen = true)}
>
	<MapPinIcon weight="fill" />
</Button>
<LocationChooser
	{onSubmit}
	bind:open={geoMapPickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
