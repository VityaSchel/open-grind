<script lang="ts">
	import CommandCenterSuggestion from "./CommandCenterSuggestion.svelte";

	let {
		icon,
		prefix,
		command,
	}: {
		icon: import("svelte").Snippet;
		prefix: string;
		command: string;
	} = $props();
</script>

<CommandCenterSuggestion>
	{@render icon()}
	<span>
		Start with <code class="rounded-xs bg-muted px-1 py-px font-mono">
			{prefix}
		</code>
		to {command}
	</span>
</CommandCenterSuggestion>
