<script lang="ts">
	import { PIN_ZOOM } from "$lib/components/location-chooser/constants";
	import GeoMapPicker from "$lib/components/location-chooser/GeoMapPicker.svelte";
	import { t } from "$lib/i18n";
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
		onSelectionChange({ count, action: "sendLocation" });
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
	{t("chat.composer.attachments.location.a11y.description")}
</p>
<div
	class="relative mx-auto mb-[calc(var(--sheet-actions-clearance)-var(--sheet-panel-padding-bottom))] aspect-square w-[min(100%,max(12rem,50svh))] overflow-hidden rounded-lg"
	data-vaul-no-drag
>
	<GeoMapPicker
		bind:pinPos
		initialView={pinPos ? { ...pinPos, zoom: PIN_ZOOM } : undefined}
	/>
</div>
