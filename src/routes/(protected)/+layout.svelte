<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";
	import { startOnlineHeartbeat } from "$lib/presence/online-heartbeat";

	let { children }: { children: import("svelte").Snippet } = $props();

	$effect(() => startOnlineHeartbeat());
</script>

{@render children()}
<CommandCenter />
