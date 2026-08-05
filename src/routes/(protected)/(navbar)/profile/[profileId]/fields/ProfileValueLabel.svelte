<script lang="ts">
	let {
		label,
		children,
	}: { label: string; children?: import("svelte").Snippet } = $props();
</script>

<div class="gap-1">
	<span class="font-light text-neutral-500">{label}</span>
	{@render children?.()}
</div>
