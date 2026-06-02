<script lang="ts">
	let { children }: { children?: import("svelte").Snippet } = $props();
</script>

<div class="flex items-center gap-1">
	{@render children?.()}
</div>
