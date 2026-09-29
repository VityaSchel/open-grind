<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";
	import { retryBrokenMediaWhenOnline } from "$lib/util/media-retry-signals";

	let { children }: { children: import("svelte").Snippet } = $props();

	$effect(() => startOnlineHeartbeat());
	$effect(() => retryBrokenMediaWhenOnline());
</script>

{@render children()}
<CommandCenter />
