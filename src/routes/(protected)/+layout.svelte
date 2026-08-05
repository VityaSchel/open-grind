<script lang="ts">
	import CommandCenter from "$lib/components/command-center/CommandCenter.svelte";

	let { children }: { children: import("svelte").Snippet } = $props();
</script>

{@render children()}
<CommandCenter />
