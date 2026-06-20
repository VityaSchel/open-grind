<script lang="ts">
	import { MediaQuery } from "svelte/reactivity";

	import GeoMapPicker from "$lib/components/location-chooser/GeoMapPicker.svelte";
	import Button from "$lib/components/ui/button/button.svelte";
	import * as Dialog from "$lib/components/ui/dialog";
	import * as Drawer from "$lib/components/ui/drawer/index";
	import { encodeGeohash } from "$lib/model/geohash";

	let {
		onSubmit,
		open = $bindable(),
		pinPos = $bindable(),
	}: {
		onSubmit: (geohash: string) => void;
		open: boolean;
		pinPos?:
			| {
					lat: number;
					lon: number;
					zoom: number;
			  }
			| undefined;
	} = $props();

	const isDesktop = new MediaQuery("(min-width: 768px)");

	function onSubmitPin() {
		if (!pinPos) return;
		const geohash = encodeGeohash(pinPos.lat, pinPos.lon);
		open = false;
		void onSubmit(geohash);
	}

	let geoMapPicker: GeoMapPicker | null = $state(null);

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
</script>

{#if isDesktop.current}
	<Dialog.Root bind:open>
		<Dialog.Content
			class="sm:max-w-200 h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-4rem)] flex flex-col"
			preventOverflowTextSelection={false}
			showCloseButton={false}
		>
			<div
				class="h-full touch-manipulation rounded-lg overflow-clip flex-1"
				data-vaul-no-drag
			>
				<GeoMapPicker bind:pinPos bind:this={geoMapPicker} />
			</div>
			<Dialog.Footer>
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
				<!-- <Dialog.Close class={buttonVariants({ variant: "outline" })}>
						Cancel
					</Dialog.Close> -->
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{:else}
	<Drawer.Root bind:open>
		<Drawer.Content
			preventOverflowTextSelection={false}
			class="h-full! mt-0! mb-(--safe-area-bottom)"
		>
			<div
				class="h-full touch-manipulation rounded-lg overflow-clip mt-4 mb-2"
				data-vaul-no-drag
			>
				<GeoMapPicker bind:pinPos bind:this={geoMapPicker} />
			</div>
			<Drawer.Footer class="pt-2 pb-(--safe-area-bottom)">
				<Button type="submit" disabled={!pinPos} onclick={onSubmitPin}>
					Save
				</Button>
				<!-- <Drawer.Close class={buttonVariants({ variant: "outline" })}>
						Cancel
					</Drawer.Close> -->
			</Drawer.Footer>
		</Drawer.Content>
	</Drawer.Root>
{/if}
