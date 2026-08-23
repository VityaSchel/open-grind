<script lang="ts">
	import type { Snippet } from "svelte";

	import { Label } from "$lib/components/ui/label";

	let {
		label,
		error,
		hint,
		children,
	}: { label: string; error?: string; hint?: string; children: Snippet } =
		$props();
</script>

<div class="flex flex-col gap-1.5">
	<Label class="px-1">{label}</Label>
	{@render children()}
	{#if error}
		<p class="px-1 text-xs text-destructive">{error}</p>
	{:else if hint}
		<p class="px-1 text-xs text-muted-foreground">{hint}</p>
	{/if}
</div>
