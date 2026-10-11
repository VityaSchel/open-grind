<script lang="ts">
	import Rich from "$lib/i18n/Rich.svelte";
	import type { RichKeyWith } from "$lib/i18n";
	import CommandCenterSuggestion from "./CommandCenterSuggestion.svelte";

	let {
		icon,
		prefix,
		message,
	}: {
		icon: import("svelte").Snippet;
		prefix: string;
		message: RichKeyWith<{ prefix: "placeholder" }>;
	} = $props();
</script>

{#snippet prefixCode()}
	<code class="rounded-xs bg-muted px-1 py-px font-mono" translate="no">
		{prefix}
	</code>
{/snippet}

<CommandCenterSuggestion>
	{@render icon()}
	<span><Rich key={message} prefix={prefixCode} /></span>
</CommandCenterSuggestion>
