<script lang="ts">
	let {
		title,
		children,
	}: { title: string; children?: import("svelte").Snippet } = $props();
</script>

<div class="mt-4 hidden flex-col gap-2 has-data-[slot=profile-field]:flex">
	<span class="text-sm text-muted-foreground uppercase">{title}</span>
	{@render children?.()}
</div>
