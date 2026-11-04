<script lang="ts">
	import MapPinIcon from "phosphor-svelte/lib/MapPinIcon";

	import { t } from "#lib/i18n/index.ts";
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
