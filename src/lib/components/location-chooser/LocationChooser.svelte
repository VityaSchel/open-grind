<script lang="ts">
	import { untrack } from "svelte";

	import {
		getPreferencesSnapshot,
		preferencesLoaded,
	} from "$lib/app-data/preferences.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer/index";
	import { Label } from "$lib/components/ui/label";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { Switch } from "$lib/components/ui/switch";
	import { autoLocation } from "$lib/location/auto-location";
	import { reportLocationFailure } from "$lib/location/location-feedback";
	import { locationRequest } from "$lib/location/location-request.svelte";
	import { encodeGeohash } from "$lib/model/geohash";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { isMobilePlatform } from "$lib/platform/os";
	import { above } from "$lib/util/breakpoints.svelte";
	import { PIN_ZOOM } from "./constants";
	import type GeoMapPickerComponent from "./GeoMapPicker.svelte";

	let {
		onSubmit,
		open = $bindable(),
		pinPos = $bindable(),
	}: {
		onSubmit: (submission: {
			geohash: string;
			autoUpdateLocation: boolean;
		}) => void;
		open: boolean;
		pinPos?: { lat: number; lon: number; zoom: number } | undefined;
	} = $props();

	const isDesktop = above("md");
	const gpsAvailable = isMobilePlatform();

	let pendingAutoUpdate = $state<boolean | null>(null);
	const autoUpdateLocation = $derived(
		pendingAutoUpdate ?? getPreferencesSnapshot().autoUpdateLocation,
	);

	async function setAutoUpdateLocation(enabled: boolean) {
		pendingAutoUpdate = enabled;
		if (!enabled) {
			locationRequest.abort();
			return;
		}
		const outcome = await locationRequest.run();
		if (outcome.status === "ok" || outcome.status === "aborted") return;
		pendingAutoUpdate = false;
		reportLocationFailure(outcome);
	}

	const fix = $derived(locationRequest.lastFix);
	$effect(() => {
		if (!autoUpdateLocation || !fix) return;
		const zoom = untrack(() => pinPos?.zoom) ?? PIN_ZOOM;
		pinPos = { lat: fix.lat, lon: fix.lon, zoom };
	});

	$effect(() => {
		if (!open) return;
		pendingAutoUpdate = null;
		autoLocation.suspend();
		// untracked: a tracked read of the request's pending state would re-run
		// this effect and abort the fetch it just started
		untrack(() => void autoLocation.refreshStaleFix());
		return () => {
			locationRequest.abort();
			autoLocation.resume();
		};
	});

	function onSubmitPin() {
		if (!pinPos) return;
		const geohash = encodeGeohash({ lat: pinPos.lat, lon: pinPos.lon });
		const submission = { geohash, autoUpdateLocation };
		open = false;
		void onSubmit(submission);
	}

	let geoMapPicker: GeoMapPickerComponent | null = $state(null);

	let pendingCenter: { lat: number; lon: number; zoom: number } | null =
		$state(null);
	export function centerAt({
		lat,
		lon,
		zoom,
	}: {
		lat: number;
		lon: number;
		zoom: number;
	}) {
		if (!geoMapPicker) {
			pendingCenter = { lat, lon, zoom };
		} else {
			geoMapPicker.centerAt({ lat, lon, zoom });
		}
	}

	$effect(() => {
		if (pendingCenter && geoMapPicker) {
			geoMapPicker.centerAt(pendingCenter);
			pendingCenter = null;
		}
	});

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			open = false;
		},
	});
</script>

{#snippet mapPicker()}
	{#await import("./GeoMapPicker.svelte")}
		<div class="flex h-full items-center justify-center">
			<Spinner class="size-8" />
		</div>
	{:then { default: GeoMapPicker }}
		<GeoMapPicker
			bind:pinPos
			bind:this={geoMapPicker}
			locked={autoUpdateLocation}
		/>
	{/await}
{/snippet}
{#snippet saveButton()}
	<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>Save</Button>
{/snippet}
{#snippet trackGpsAutomaticallySwitcher(opts?: {
	class: import("svelte/elements").ClassValue;
})}
	<Label for="track-gps-automatically" class={["px-3 py-1", opts?.class]}>
		<Switch
			id="track-gps-automatically"
			disabled={!preferencesLoaded()}
			bind:checked={
				() => autoUpdateLocation,
				(newValue: boolean) => void setAutoUpdateLocation(newValue)
			}
		/>
		<span class="truncate py-1">Update automatically using GPS</span>
	</Label>
{/snippet}
{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content
			class="flex h-[calc(var(--screen-safe)-4rem)] flex-col sm:max-w-200"
			showCloseButton={false}
		>
			<div
				class="h-full flex-1 touch-manipulation overflow-clip rounded-lg"
				data-vaul-no-drag
			>
				{@render mapPicker()}
			</div>
			<Dialog.Footer class={{ "sm:justify-between": gpsAvailable }}>
				{#if gpsAvailable}
					{@render trackGpsAutomaticallySwitcher({ class: "-ms-3" })}
				{/if}
				{@render saveButton()}
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Content
			preventOverflowTextSelection={false}
			class="mt-0! mb-(--safe-area-bottom) h-full!"
		>
			<div
				class="mt-4 mb-2 h-full touch-manipulation overflow-clip rounded-lg"
				data-vaul-no-drag
			>
				{@render mapPicker()}
			</div>
			<Drawer.Footer class="pt-2">
				{#if gpsAvailable}
					{@render trackGpsAutomaticallySwitcher({
						class: "-ms-2.75",
					})}
				{/if}
				{@render saveButton()}
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{/if}
