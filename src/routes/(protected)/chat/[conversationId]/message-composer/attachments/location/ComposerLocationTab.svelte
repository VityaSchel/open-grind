<script lang="ts">
	import { PIN_ZOOM } from "$lib/components/location-chooser/constants";
	import GeoMapPicker from "$lib/components/location-chooser/GeoMapPicker.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import type { Coordinates } from "$lib/location/location-request.svelte";
	import { getMessageComposerContext } from "../../message-composer-context.svelte";
	import type { TabSelection } from "../tabs";

	let {
		onClose,
		onSelectionChange,
		pinPos = $bindable(),
		hintId,
	}: {
		pinPos?: Coordinates;
		hintId?: string;
		onClose: () => void;
		onSelectionChange: (selection: TabSelection) => void;
	} = $props();

	const composer = getMessageComposerContext();

	const count = $derived(pinPos ? 1 : 0);
	$effect(() => {
		onSelectionChange({ count, label: "Send location" });
	});

	export function submitSelection() {
		if (!pinPos || composer().disabled) return;
		const { lat, lon } = pinPos;
		onClose();
		void composer().sendMessages([
			draftFromMessage({ type: "Location", body: { lat, lon } }),
		]);
	}
</script>

<p id={hintId} class="sr-only">
	Drag the map to place the pin on the location you want to share.
</p>
<div
	class="relative mx-auto mb-[calc(var(--sheet-actions-clearance)-var(--spacing)*20)] aspect-square w-[min(100%,max(12rem,50svh))] overflow-hidden rounded-lg"
	data-vaul-no-drag
>
	<GeoMapPicker
		bind:pinPos
		initialView={pinPos ? { ...pinPos, zoom: PIN_ZOOM } : undefined}
	/>
</div>
