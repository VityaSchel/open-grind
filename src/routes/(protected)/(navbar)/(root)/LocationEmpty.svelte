<script lang="ts">
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import AutoLocationToast from "$lib/components/feedback/AutoLocationToast.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { reportLocationFailure } from "$lib/location/location-feedback";
	import { locationRequest } from "$lib/location/location-request.svelte";
	import { encodeGeohash } from "$lib/model/geohash";
	import { isMobilePlatform } from "$lib/platform/os";

	let geoMapPickerOpen = $state(false);

	const geoApiSupported = isMobilePlatform();
	let disabled = $state(false);

	async function handleDetectLocation() {
		disabled = true;
		try {
			const outcome = await locationRequest.run();
			if (outcome.status === "ok")
				await useDetectedLocation(outcome.coords);
			else reportLocationFailure(outcome);
		} finally {
			disabled = false;
		}
	}

	async function useDetectedLocation(coords: { lat: number; lon: number }) {
		try {
			await setPreferences({
				geohash: encodeGeohash(coords),
				autoUpdateLocation: true,
			});
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to save location", error });
			return;
		}
		toast(AutoLocationToast);
	}

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
</script>

<Empty.Root class="max-md:p-6">
	<Empty.Header>
		<Empty.Media variant="icon">
			<NavigationArrowIcon weight="fill" color="var(--primary)" />
		</Empty.Media>
		<Empty.Title>Choose location</Empty.Title>
		<Empty.Description>
			Pick a location on the map or select from the list to find nearby
			profiles.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex flex-wrap justify-center gap-2">
			{#if geoApiSupported}
				<Button
					variant="default"
					onclick={handleDetectLocation}
					{disabled}
				>
					<GpsFixIcon color="currentColor" weight="fill" />
					Use current location
				</Button>
			{/if}
			<Button
				variant={geoApiSupported ? "outline" : "default"}
				onclick={() => (geoMapPickerOpen = true)}
			>
				<MagnifyingGlassIcon color="currentColor" weight="fill" />
				Pick manually
			</Button>
		</div>
	</Empty.Content>
</Empty.Root>
<LocationChooser {onSubmit} bind:open={geoMapPickerOpen} />
