<script lang="ts">
	import { onMount } from "svelte";

	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { restoreStrandedLocation } from "$lib/entitlements/honduras-hold";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";
	import { retryBrokenMediaWhenOnline } from "$lib/util/media-retry-signals";

	let { children }: { children: import("svelte").Snippet } = $props();

	$effect(() => startOnlineHeartbeat());
	$effect(() => retryBrokenMediaWhenOnline());

	onMount(() => {
		restoreStrandedLocation().catch((error: unknown) => {
			console.error("Could not move back from Honduras", error);
		});
	});
</script>

{@render children()}
<CommandCenter />
