<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer/index";
	import Spinner from "$lib/components/ui/spinner/spinner.svelte";
	import { encodeGeohash } from "$lib/model/geohash";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { above } from "$lib/util/breakpoints.svelte";
	import type GeoMapPickerComponent from "./GeoMapPicker.svelte";

	let {
		onSubmit,
		open = $bindable(),
		pinPos = $bindable(),
	}: {
		onSubmit: (geohash: string) => void;
		open: boolean;
		pinPos?: { lat: number; lon: number; zoom: number } | undefined;
	} = $props();

	const isDesktop = above("md");

	function onSubmitPin() {
		if (!pinPos) return;
		const geohash = encodeGeohash({ lat: pinPos.lat, lon: pinPos.lon });
		open = false;
		void onSubmit(geohash);
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
		<GeoMapPicker bind:pinPos bind:this={geoMapPicker} />
	{/await}
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
			<Dialog.Footer>
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
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
			<Drawer.Footer class="pt-2 pb-(--safe-area-bottom)">
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{/if}
