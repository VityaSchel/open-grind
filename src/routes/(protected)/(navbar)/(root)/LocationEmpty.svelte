<script lang="ts">
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { platform } from "@tauri-apps/plugin-os";
	import GpsFixIcon from "phosphor-svelte/lib/GpsFixIcon";
	import MagnifyingGlassIcon from "phosphor-svelte/lib/MagnifyingGlassIcon";
	import NavigationArrowIcon from "phosphor-svelte/lib/NavigationArrowIcon";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error";
	import { setPreferences } from "$lib/app-data/preferences.svelte";
	import LocationChooser from "$lib/components/location-chooser/LocationChooser.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import { encodeGeohash } from "$lib/model/geohash";

	let geoMapPickerOpen = $state(false);

	const geoApiSupported = $derived(["android", "ios"].includes(platform()));
	let disabled = $state(false);

	async function handleDetectLocation() {
		disabled = true;
		try {
			let permissions = await checkPermissions();
			if (
				permissions.location === "prompt" ||
				permissions.location === "prompt-with-rationale"
			) {
				permissions = await requestPermissions(["location"]);
			}
			if (permissions.location === "granted") {
				try {
					const {
						coords: { latitude, longitude },
					} = await getCurrentPosition();

					await submitGeohash(encodeGeohash(latitude, longitude));
				} catch (error) {
					console.error(error);
					showErrorToast({
						label: "Failed to get current location",
						error,
					});
				}
			} else {
				toast.error(
					"Location permission denied. Change this in your system settings to use this button.",
				);
			}
		} finally {
			disabled = false;
		}
	}

	async function submitGeohash(geohash: string) {
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
</script>

<Empty.Root class="max-md:p-6">
	<Empty.Header>
		<Empty.Media variant="icon">
			<NavigationArrowIcon weight="fill" color="var(--primary)" />
		</Empty.Media>
		<Empty.Title>Choose location</Empty.Title>
		<Empty.Description>
			Pick location on the map or select from the list to find nearby profiles.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex flex-wrap justify-center gap-2">
			{#if geoApiSupported}
				<Button variant="default" onclick={handleDetectLocation} {disabled}>
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
	<!-- <Button variant="link" class="text-muted-foreground" size="sm">
		<a href="#/">
			Learn More <ArrowUpRightIcon class="inline" />
		</a>
	</Button> -->
</Empty.Root>
<LocationChooser onSubmit={submitGeohash} bind:open={geoMapPickerOpen} />
