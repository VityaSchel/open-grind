<script lang="ts">
	import { latLng } from "leaflet";
	import { Circle, ControlAttribution, Map, TileLayer } from "sveaflet";
	import { untrack } from "svelte";
	import type { Circle as LeafletCircle, Map as LeafletMap } from "leaflet";

	import {
		ACCURACY_CIRCLE_COLOR,
		OSM_TILE_OPTIONS,
		OSM_TILE_URL,
	} from "#lib/components/location-chooser/constants.ts";
	import { openMapLinksExternally } from "#lib/components/location-chooser/map-links.ts";
	import {
		accuracyMapSpanMeters,
		approximateRadiusMeters,
	} from "./post-form";

	let {
		center,
		locationRadius,
	}: { center: { lat: number; lon: number }; locationRadius: number } =
		$props();

	const initial = untrack(() => ({
		center: [center.lat, center.lon] as [number, number],
		radius: approximateRadiusMeters({ locationRadius }),
	}));

	let map: LeafletMap | undefined = $state();
	let circle: LeafletCircle | undefined = $state();

	function fit({
		instance,
		shape,
	}: {
		instance: LeafletMap;
		shape: LeafletCircle;
	}) {
		const at = latLng(center.lat, center.lon);
		shape
			.setLatLng(at)
			.setRadius(approximateRadiusMeters({ locationRadius }));
		const view = at.toBounds(accuracyMapSpanMeters({ locationRadius }));
		instance.setView(at, instance.getBoundsZoom(view), { animate: false });
	}

	$effect(() => {
		if (map && circle) fit({ instance: map, shape: circle });
	});

	$effect(() => {
		if (!map || !circle) return;
		const instance = map;
		const shape = circle;
		const observer = new ResizeObserver(() => {
			instance.invalidateSize({ animate: false });
			untrack(() => fit({ instance, shape }));
		});
		observer.observe(instance.getContainer());
		return () => observer.disconnect();
	});

	$effect(() => {
		const container = map?.getContainer();
		if (container) return openMapLinksExternally(container);
	});
</script>

<div
	data-slot="post-location-map"
	class="relative isolate h-40 overflow-hidden rounded-lg"
>
	<Map
		options={{
			center: initial.center,
			zoom: 14,
			zoomControl: false,
			attributionControl: false,
			dragging: false,
			touchZoom: false,
			doubleClickZoom: false,
			scrollWheelZoom: false,
			boxZoom: false,
			keyboard: false,
			tapHold: false,
			zoomSnap: 0,
			zoomAnimation: false,
			markerZoomAnimation: false,
			inertia: false,
			trackResize: false,
		}}
		bind:instance={map}
	>
		<TileLayer url={OSM_TILE_URL} options={OSM_TILE_OPTIONS} />
		<ControlAttribution options={{ prefix: undefined }} />
		<Circle
			latLng={initial.center}
			options={{
				radius: initial.radius,
				color: ACCURACY_CIRCLE_COLOR,
				weight: 2,
				fill: false,
				interactive: false,
			}}
			bind:instance={circle}
		/>
	</Map>
</div>
