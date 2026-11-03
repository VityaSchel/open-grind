<script lang="ts">
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";

	import { openExternalLink } from "#lib/platform/link-opener.ts";
	import { currentPlatform } from "#lib/platform/os.ts";
	import type { LocationMessage } from "#lib/model/messaging/messages.ts";
	import MessageBubble from "./MessageBubble.svelte";
	import { singleClick } from "./single-click";

	let { message }: { message: LocationMessage["body"] } = $props();

	const mapUrl = $derived.by(() => {
		switch (currentPlatform()) {
			case "android":
				return `geo:${message.lat},${message.lon}?q=${message.lat},${message.lon}`;
			case "ios":
				return `https://maps.apple.com/?ll=${message.lat},${message.lon}&q=${message.lat},${message.lon}`;
			case "linux":
			case "macos":
			case "windows":
				return `https://www.openstreetmap.org/?mlat=${message.lat}&mlon=${message.lon}#map=16/${message.lat}/${message.lon}`;
		}
	});
	function openMap(event: MouseEvent) {
		event.preventDefault();
		openExternalLink(mapUrl);
	}
</script>

<MessageBubble tone="sent">
	<a
		href={mapUrl}
		onclick={openMap}
		{@attach singleClick}
		class="-mx-3 -my-2 flex items-center gap-3 rounded-[inherit] px-3 py-2 select-none"
	>
		<MapPinIcon size={28} weight="fill" aria-hidden="true" />
		<div>
			<div class="font-medium">Location</div>
			<div class="text-xs opacity-70">
				{message.lat.toFixed(5)}, {message.lon.toFixed(5)}
			</div>
			<span class="text-sm underline underline-offset-2"> Open map </span>
		</div>
	</a>
</MessageBubble>
