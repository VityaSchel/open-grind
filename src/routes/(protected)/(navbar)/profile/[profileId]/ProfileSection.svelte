<script lang="ts">
	let {
		title,
		children,
	}: { title: string; children?: import("svelte").Snippet } = $props();
</script>

<div class="mt-4 flex flex-col gap-2">
	<span class="text-sm text-muted-foreground uppercase">{title}</span>
	{@render children?.()}
</div>
