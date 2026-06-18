<script lang="ts">
	import { GpsFixIcon, PencilSimpleIcon } from "phosphor-svelte";
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
		expansion,
	}: {
		onUpdate?: () => void;
		class?: import("svelte/elements").ClassValue;
		expansion: number;
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
		"transition-none relative *:absolute *:top-1/2 *:left-1/2 *:-translate-1/2 *:flex *:items-center *:justify-center *:gap-1.5 overflow-clip",
		className,
	]}
	style="width: max(44px, {expansion * 100}%)"
	onclick={() => (geoMapPickerOpen = true)}
>
	<div style="opacity: {expansion}">
		<PencilSimpleIcon weight="fill" />
		Change location
	</div>
	<div style="opacity: {1 - expansion}">
		<GpsFixIcon weight="fill" />
	</div>
</Button>
<LocationChooser
	{onSubmit}
	bind:open={geoMapPickerOpen}
	bind:this={locationChooser}
	bind:pinPos
/>
