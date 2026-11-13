<script lang="ts">
	import { Map, TileLayer } from "sveaflet";
	import { untrack } from "svelte";
	import type { Map as LeafletMap } from "leaflet";

	import {
		ACCURACY_CIRCLE_COLOR,
		OSM_COPYRIGHT_URL,
		OSM_TILE_OPTIONS,
		OSM_TILE_URL,
	} from "#lib/components/location-chooser/constants.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { accuracyMapView } from "./accuracy-map";

	let {
		center,
		locationRadius,
	}: { center: { lat: number; lon: number }; locationRadius: number } =
		$props();

	const STARTING_ZOOM = 14;

	let map: LeafletMap | undefined = $state();
	let circleDiameterPx = $state(0);

	const view = $derived(
		circleDiameterPx > 0
			? accuracyMapView({
					locationRadius,
					latitude: center.lat,
					circleDiameterPx,
				})
			: null,
	);
	const zoom = $derived(view?.zoom ?? null);

	$effect(() => {
		if (!map || zoom === null) return;
		map.setView([center.lat, center.lon], zoom, { animate: false });
	});

	$effect(() => {
		if (!map) return;
		const instance = map;
		const observer = new ResizeObserver(() =>
			instance.invalidateSize({ animate: false }),
		);
		observer.observe(instance.getContainer());
		return () => observer.disconnect();
	});
</script>

<div
	data-slot="post-location-map"
	class="leaflet-container relative isolate h-40 overflow-hidden rounded-sm md:h-60"
>
	<div
		class="absolute -inset-1/2"
		style:transform={view === null ? undefined : `scale(${view.scale})`}
	>
		<Map
			options={{
				center: untrack(() => ({ lat: center.lat, lng: center.lon })),
				zoom: STARTING_ZOOM,
				zoomControl: false,
				attributionControl: false,
				dragging: false,
				touchZoom: false,
				doubleClickZoom: false,
				scrollWheelZoom: false,
				boxZoom: false,
				keyboard: false,
				tapHold: false,
				zoomAnimation: false,
				markerZoomAnimation: false,
				inertia: false,
				trackResize: false,
			}}
			bind:instance={map}
		>
			<TileLayer url={OSM_TILE_URL} options={OSM_TILE_OPTIONS} />
		</Map>
	</div>
	<div
		aria-hidden="true"
		class="pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-1/2 rounded-full border-2"
		style:border-color={ACCURACY_CIRCLE_COLOR}
		bind:offsetWidth={circleDiameterPx}
	></div>
	<div class="leaflet-bottom leaflet-right">
		<div class="leaflet-control-attribution leaflet-control">
			&copy; <Link
				href={OSM_COPYRIGHT_URL}
				target="_blank"
				rel="noreferrer nofollow noopener"
				>OpenStreetMap contributors</Link
			> &nbsp;
		</div>
	</div>
</div>
