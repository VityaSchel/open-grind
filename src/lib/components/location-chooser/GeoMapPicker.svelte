<script lang="ts">
	import { divIcon, latLng } from "leaflet";
	import {
		Circle,
		ControlAttribution,
		Map,
		Marker,
		TileLayer,
	} from "sveaflet";
	import { sineOut } from "svelte/easing";
	import { fade } from "svelte/transition";
	import type {
		DragEndEvent,
		Map as LeafletMap,
		Marker as LeafletMarker,
		LeafletMouseEventHandlerFn,
	} from "leaflet";

	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { locationRequest } from "$lib/location/location-request.svelte";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { isMobilePlatform } from "$lib/platform/os";
	import { PIN_ZOOM } from "./constants";
	import LocateMeButton from "./LocateMeButton.svelte";
	import PlaceSearch from "./PlaceSearch.svelte";

	let {
		pinPos = $bindable(),
		locked = false,
	}: { pinPos?: { lat: number; lon: number }; locked?: boolean } = $props();

	const gpsAvailable = isMobilePlatform();

	const FADE = { duration: 150, easing: sineOut };
	const ACCURACY_VIEWPORT_FACTOR = 4;
	const MAX_ZOOM = 18;
	const LOCATE_MIN_ZOOM = 16;

	const locating = $derived(locationRequest.pending);
	const covering = $derived(locked && locating);
	const fix = $derived(locationRequest.lastFix);
	const showAccuracy = $derived(locked && fix !== null && !locating);
	const accuracyOwnsCamera = $derived(locked && fix !== null);

	const interactions = [
		"dragging",
		"touchZoom",
		"doubleClickZoom",
		"scrollWheelZoom",
		"boxZoom",
		"keyboard",
		"tapHold",
	] as const;

	let map: LeafletMap | undefined = $state();
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
		if (accuracyOwnsCamera) return;
		if (map) map.setView([lat, lon], zoom);
		else pendingCenter = { lat, lon, zoom };
	}

	function movePin({
		lat,
		lon,
		zoom,
	}: {
		lat: number;
		lon: number;
		zoom: number;
	}) {
		pinPos = { lat, lon };
		map?.setView([lat, lon], zoom);
	}

	$effect(() => {
		if (!locked || !fix || !map) return;
		map.fitBounds(
			latLng(fix.lat, fix.lon).toBounds(
				fix.accuracyMeters * ACCURACY_VIEWPORT_FACTOR,
			),
			{ maxZoom: MAX_ZOOM, animate: false },
		);
	});

	$effect(() => {
		if (pendingCenter && map) {
			if (!accuracyOwnsCamera) {
				map.setView(
					[pendingCenter.lat, pendingCenter.lon],
					pendingCenter.zoom,
				);
			}
			pendingCenter = undefined;
		}
	});

	$effect(() => {
		if (!map) return;
		for (const name of interactions) {
			if (locked) map[name]?.disable();
			else map[name]?.enable();
		}
		if (locked) map.zoomControl.remove();
		else map.zoomControl.addTo(map);
		map.getContainer().style.cursor = locked ? "default" : "";
	});

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

	$effect(() => {
		if (!map || locked) return;
		const onMapClick: LeafletMouseEventHandlerFn = ({ latlng }) => {
			pinPos = { lat: latlng.lat, lon: latlng.lng };
			map?.panTo(latlng);
		};
		map.on("click", onMapClick);
		return () => {
			map?.off("click", onMapClick);
		};
	});
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

		{#if showAccuracy && fix}
			<Circle
				latLng={[fix.lat, fix.lon]}
				options={{
					radius: fix.accuracyMeters,
					color: "#3b82f6",
					weight: 0.5,
					opacity: 0.5,
					fillColor: "#3b82f6",
					fillOpacity: 0.15,
				}}
			/>
		{:else if pinPos && !covering}
			{#key locked}
				<Marker
					latLng={[pinPos.lat, pinPos.lon]}
					ondragend={(event: DragEndEvent) => {
						const { lat, lng } = (
							event.target as LeafletMarker
						).getLatLng();
						pinPos = { lat, lon: lng };
					}}
					options={{
						draggable: !locked,
						title: "Selected location",
						icon: divIcon({
							html: '<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="40" height="40" fill="#ffba20" stroke="#000000" stroke-width="8px" viewBox="0 0 256 256"><path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path></svg>',
							iconAnchor: [20, 40],
							iconSize: [40, 40],
							className: "",
						}),
					}}
				/>
			{/key}
		{/if}
	</Map>
	{#if covering}
		<div
			data-slot="map-cover"
			class="absolute inset-0 z-1000 flex items-center justify-center bg-black/50"
			transition:fade={FADE}
		>
			<Spinner class="size-12 text-white" />
		</div>
	{/if}
	<div
		data-slot="map-controls"
		class={[
			"transition-opacity duration-400 ease-out",
			{ "pointer-events-none opacity-0": locked },
		]}
		inert={locked}
	>
		<PlaceSearch
			clearsLocateButton={gpsAvailable}
			onpick={(place) => movePin({ ...place, zoom: PIN_ZOOM })}
		/>
		{#if gpsAvailable}
			<LocateMeButton
				onlocate={(at) =>
					movePin({
						...at,
						zoom: Math.max(
							map?.getZoom() ?? LOCATE_MIN_ZOOM,
							LOCATE_MIN_ZOOM,
						),
					})}
			/>
		{/if}
	</div>
</div>
