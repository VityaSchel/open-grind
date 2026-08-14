<script lang="ts">
	import {
		checkPermissions,
		getCurrentPosition,
		requestPermissions,
	} from "@tauri-apps/plugin-geolocation";
	import { divIcon } from "leaflet";
	import { GpsFixIcon } from "phosphor-svelte";
	import { ControlAttribution, Map, Marker, TileLayer } from "sveaflet";
	import { toast } from "svelte-sonner";
	import type {
		DragEndEvent,
		Map as LeafletMap,
		Marker as LeafletMarker,
		LeafletMouseEventHandlerFn,
	} from "leaflet";

	import { getPlaces } from "$lib/api/browse/location";
	import { showErrorToast } from "$lib/api/error-toast";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { isMobilePlatform } from "$lib/platform/os";

	let { pinPos = $bindable() }: { pinPos?: { lat: number; lon: number } } =
		$props();

	let map: LeafletMap | undefined = $state();

	$effect(() => {
		const container = map?.getContainer();
		if (!container) return;
		const openExternally = (event: MouseEvent) => {
			if (event.target instanceof HTMLElement) {
				const href = event.target
					?.closest("a[href]")
					?.getAttribute("href");
				if (href) {
					event.preventDefault();
					openExternalLink(href);
				}
			}
		};
		container.addEventListener("click", openExternally);
		return () => container.removeEventListener("click", openExternally);
	});
	let gpsRequestInProgress = $state(false);

	$effect(() => {
		if (map) {
			const onMapClick: LeafletMouseEventHandlerFn = ({ latlng }) => {
				pinPos = { lat: latlng.lat, lon: latlng.lng };
				map?.panTo(latlng);
			};
			map.on("click", onMapClick);
			return () => {
				map?.off("click", onMapClick);
			};
		}
	});

	let searchQuery = $state("");
	let showSearchResults = $state(false);
	const searchPlaces = $derived.by(async () => {
		const query = searchQuery.trim();
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
			map.setView(
				[pendingCenter.lat, pendingCenter.lon],
				pendingCenter.zoom,
			);
			pendingCenter = undefined;
		}
	});

	dismissOnBackGesture({
		active: () => showSearchResults,
		dismiss: () => {
			showSearchResults = false;
		},
	});

	const gpsAvailable = isMobilePlatform();
</script>

<div class="relative h-[inherit] w-[inherit]">
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
				ondragend={(event: DragEndEvent) => {
					const { lat, lng } = (
						event.target as LeafletMarker
					).getLatLng();
					pinPos = { lat, lon: lng };
				}}
				options={{
					draggable: true,
					title: "Selected location",
					icon: divIcon({
						html: '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="40" height="40" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
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
			"absolute bottom-4 z-1010 w-full p-2",
			{ "max-w-[calc(100%-2.5rem)]": gpsAvailable },
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
	</div>
	{#if showSearchResults}
		<div class="absolute top-0 left-0 z-1000 size-full p-1">
			<div
				class="flex h-full w-full flex-col gap-2 overflow-auto rounded-md bg-popover-foreground px-1 py-3 text-popover shadow-md backdrop-blur-xl"
			>
				{#await searchPlaces}
					<Spinner class="m-auto size-8" />
				{:then response}
					{#if response}
						{#each response.places.toSorted((a, b) => b.importance - a.importance) as place (`${place.lat},${place.lon},${place.name}`)}
							<Button
								class="flex h-auto cursor-pointer flex-col items-start justify-start gap-0 text-left text-current"
								variant="link"
								onclick={() => {
									pinPos = { lat: place.lat, lon: place.lon };
									map?.setView([place.lat, place.lon], 17);
									showSearchResults = false;
								}}
							>
								<span
									class="line-clamp-1 block max-w-full truncate"
								>
									{place.name}
								</span>
								<span
									class="line-clamp-1 block max-w-full truncate text-sm text-popover/40"
								>
									{place.address}
								</span>
							</Button>
						{/each}
					{/if}
				{:catch error}
					<ApiErrorDisplay
						{error}
						buttonVariant="secondary"
						class="m-auto"
					/>
				{/await}
			</div>
		</div>
	{/if}
	{#if gpsAvailable}
		<div class="absolute right-2 bottom-6 z-1010 rounded-full">
			<Button
				size="icon-lg"
				aria-label="Locate me"
				variant="default"
				class="cursor-pointer bg-white text-black shadow-sm hover:bg-neutral-100"
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
								permissions = await requestPermissions([
									"location",
								]);
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
