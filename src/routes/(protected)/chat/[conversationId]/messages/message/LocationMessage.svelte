<script lang="ts">
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";
	import { onDestroy } from "svelte";

	import { t } from "$lib/i18n";
	import { openExternalLink } from "$lib/platform/link-opener";
	import { currentPlatform } from "$lib/platform/os";
	import type { LocationMessage } from "$lib/model/messaging/messages";
	import MessageBubble from "./MessageBubble.svelte";

	let { message }: { message: LocationMessage["body"] } = $props();

	const MAP_OPEN_DELAY_MS = 300;

	const mapUrl = $derived.by(() => {
		switch (currentPlatform()) {
			case "android":
				return `geo:${message.lat},${message.lon}?q=${message.lat},${message.lon}`;
			case "ios":
			case "macos":
			case "windows":
			case "linux":
			case "freebsd":
			case "dragonfly":
			case "netbsd":
			case "openbsd":
			case "solaris":
			case "web":
				return `https://www.openstreetmap.org/?mlat=${message.lat}&mlon=${message.lon}#map=16/${message.lat}/${message.lon}`;
		}
	});
	let pendingOpen: ReturnType<typeof setTimeout> | undefined;

	function cancelOpen() {
		clearTimeout(pendingOpen);
		pendingOpen = undefined;
	}

	function openMap(event: MouseEvent) {
		event.preventDefault();
		cancelOpen();
		if (event.detail > 1) return;
		const url = mapUrl;
		if (event.detail === 0) {
			openExternalLink(url);
			return;
		}
		pendingOpen = setTimeout(
			() => openExternalLink(url),
			MAP_OPEN_DELAY_MS,
		);
	}

	onDestroy(cancelOpen);
</script>

<MessageBubble tone="sent">
	<a
		href={mapUrl}
		onclick={openMap}
		onpointerdown={cancelOpen}
		ondblclick={cancelOpen}
		class="-mx-3 -my-2 flex items-center gap-3 rounded-[inherit] px-3 py-2 select-none"
	>
		<MapPinIcon size={28} weight="fill" aria-hidden="true" />
		<div>
			<div class="font-medium">
				{t("chat.message.location.title")}
			</div>
			<div class="text-xs opacity-70">
				<span translate="no" dir="ltr"
					>{message.lat.toFixed(5)}, {message.lon.toFixed(5)}</span
				>
			</div>
			<span class="text-sm underline underline-offset-2">
				{t("chat.message.location.openMap")}
			</span>
		</div>
	</a>
</MessageBubble>
