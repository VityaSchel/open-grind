<script lang="ts">
	import { onMount } from "svelte";

	import CommandCenter from "#lib/components/command-center/CommandCenter.svelte";
	import RefreshAnnouncements from "#lib/components/feedback/refresh/RefreshAnnouncements.svelte";
	import MediaDropOverlay from "#lib/components/shared/MediaDropOverlay.svelte";
	import { restoreStrandedLocation } from "#lib/entitlements/honduras-hold.ts";
	import { listenForKeyboardMedia } from "#lib/platform/keyboard-media.svelte.ts";
	import { listenForMedia } from "#lib/platform/media-intake.svelte.ts";
	import { startOnlineHeartbeat } from "#lib/presence/online-heartbeat.ts";
	import { guardDeletedPages } from "#lib/util/deleted-pages.ts";
	import { retryBrokenMediaWhenOnline } from "#lib/util/media-retry-signals.ts";

	let { children }: { children: import("svelte").Snippet } = $props();

	guardDeletedPages();

	$effect(() => startOnlineHeartbeat());
	$effect(() => retryBrokenMediaWhenOnline());
	$effect(() => listenForMedia());
	$effect(() => listenForKeyboardMedia());

	onMount(() => {
		restoreStrandedLocation().catch((error: unknown) => {
			console.error("Could not move back from Honduras", error);
		});
	});
</script>

{@render children()}
<CommandCenter />
<MediaDropOverlay />
<RefreshAnnouncements />
