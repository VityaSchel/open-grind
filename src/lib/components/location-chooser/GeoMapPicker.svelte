<script lang="ts">
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { platform } from "@tauri-apps/plugin-os";
	import { divIcon } from "leaflet";
	import { GpsFixIcon } from "phosphor-svelte";
	import { ControlAttribution, Map, Marker, TileLayer } from "sveaflet";
	import { toast } from "svelte-sonner";
	import type { Map as LeafletMap, LeafletMouseEventHandlerFn } from "leaflet";

	import { getPlaces } from "$lib/api/browse/location";
	import { showErrorToast } from "$lib/api/error";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";

	let {
		pinPos = $bindable(),
	}: {
		pinPos?: { lat: number; lon: number };
	} = $props();

	let map: LeafletMap | undefined = $state();
	let gpsRequestInProgress = $state(false);

	$effect(() => {
		if (map) {
			const onMapClick: LeafletMouseEventHandlerFn = ({ latlng }) => {
				pinPos = { lat: latlng.lat, lon: latlng.lng };
			};
			map.on("click", onMapClick);
			return () => {
				map?.off("click", onMapClick);
			};
		}
	});

	let searchQuery = $state("");
	let showSearchResults = $state(false);
	let searchPlaces = $derived.by(async () => {
		let query = searchQuery.trim();
		if (!query) return;
		const response = await getPlaces({ query });
		return response;
	});

	let pendingCenter: { lat: number; lon: number; zoom: number } | undefined =
		$state();
	export function centerAt({
		lat,
		lon,
		zoom,
	}: {
		lat: number;
		lon: number;
		zoom: number;
	}) {
		if (!map) {
			pendingCenter = { lat, lon, zoom };
		} else {
			map.setView([lat, lon], zoom);
		}
	}

	$effect(() => {
		if (pendingCenter && map) {
			map.setView([pendingCenter.lat, pendingCenter.lon], pendingCenter.zoom);
			pendingCenter = undefined;
		}
	});

	const gpsAvailable = $derived(["android", "ios"].includes(platform()));
</script>

<div class="w-[inherit] h-[inherit] relative">
	<Map
		options={{
			center: [40.42267869390329, -3.697633348267032],
			zoom: 2,
			attributionControl: false,
		}}
		bind:instance={map}
	>
		<TileLayer
			url={"https://tile.openstreetmap.org/{z}/{x}/{y}.png"}
			options={{
				maxZoom: 19,
				attribution:
					'&copy; <a href="http://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer nofollow noopener">OpenStreetMap</a> &nbsp;',
				// do not enable: https://github.com/Leaflet/Leaflet/issues/6195
				// detectRetina: true,
			}}
		/>
		<ControlAttribution options={{ prefix: undefined }} />

		{#if pinPos}
			<Marker
				latLng={[pinPos.lat, pinPos.lon]}
				options={{
					draggable: true,
					icon: divIcon({
						html: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
						iconAnchor: [20, 40],
						iconSize: [40, 40],
						className: "",
					}),
				}}
			/>
		{/if}
	</Map>
	<div
		class={[
			"absolute bottom-4 w-full z-1010 p-2",
			{
				"max-w-[calc(100%-2.5rem)]": gpsAvailable,
			},
		]}
	>
		<Input
			id="search-place"
			type="search"
			placeholder="Search places..."
			bind:value={
				() => searchQuery,
				(v: string) => {
					searchQuery = v;
					showSearchResults = v.length > 0;
				}
			}
			class="bg-popover-foreground text-background shadow-md"
			maxlength={100}
			onfocus={() => {
				if (searchQuery.trim()) {
					showSearchResults = true;
				}
			}}
			onblur={() => {
				setTimeout(() => {
					showSearchResults = false;
				}, 200);
			}}
		/>
		<!-- bottom-2 w-[calc(100%-8rem)]  -->
	</div>
	{#if showSearchResults}
		<div class="size-full z-1000 top-0 left-0 absolute p-1">
			<div
				class="bg-popover-foreground backdrop-blur-xl w-full h-full rounded-md flex flex-col text-popover shadow-md px-1 py-3 overflow-auto gap-2"
			>
				{#await searchPlaces}
					<Spinner class="m-auto size-8" />
				{:then response}
					{#if response}
						{#each response.places.toSorted((a, b) => b.importance - a.importance) as place}
							<Button
								class="flex flex-col gap-0 items-start justify-start text-current cursor-pointer text-left h-auto"
								variant="link"
								onclick={() => {
									pinPos = { lat: place.lat, lon: place.lon };
									map?.setView([place.lat, place.lon], 17);
									showSearchResults = false;
								}}
							>
								<span class="max-w-full block truncate line-clamp-1">
									{place.name}
								</span>
								<span
									class="max-w-full block truncate line-clamp-1 text-sm text-popover/40"
								>
									{place.address}
								</span>
							</Button>
						{/each}
					{/if}
				{:catch error}
					<ApiErrorDisplay {error} buttonVariant="secondary" class="m-auto" />
				{/await}
			</div>
		</div>
	{/if}
	{#if gpsAvailable}
		<div class="absolute bottom-6 right-2 z-1010 rounded-full">
			<Button
				size="icon-lg"
				aria-label="Locate me"
				variant="default"
				class="cursor-pointer bg-white text-black hover:bg-neutral-100 shadow-sm"
				disabled={gpsRequestInProgress}
				onclick={async () => {
					if (map) {
						gpsRequestInProgress = true;
						try {
							let permissions = await checkPermissions();
							if (
								permissions.location === "prompt" ||
								permissions.location === "prompt-with-rationale"
							) {
								permissions = await requestPermissions(["location"]);
							}
							if (permissions.location === "granted") {
								const pos = await getCurrentPosition();
								map.setView(
									[pos.coords.latitude, pos.coords.longitude],
									Math.max(map.getZoom(), 16),
								);
								pinPos = {
									lat: pos.coords.latitude,
									lon: pos.coords.longitude,
								};
							} else {
								toast.error(
									"Location permission denied. Change this in your system settings to use this button.",
								);
							}
						} catch (error) {
							console.error(error);
							showErrorToast({
								label: "Failed to get current location",
								error,
							});
						} finally {
							gpsRequestInProgress = false;
						}
					}
				}}
			>
				<GpsFixIcon weight="fill" class="size-6" />
			</Button>
		</div>
	{/if}
</div>
