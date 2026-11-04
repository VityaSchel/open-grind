<script lang="ts">
	import * as Command from "#lib/components/ui/command/index.ts";

	let { children }: { children: import("svelte").Snippet } = $props();
</script>

<Command.Item disabled class="text-muted-foreground">
	{@render children()}
</Command.Item>
