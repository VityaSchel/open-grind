<script lang="ts">
	let {
		label,
		children,
	}: {
		label: string;
		children?: import("svelte").Snippet;
	} = $props();
</script>

<div class="gap-1">
	<span class="text-neutral-500 font-light">{label}</span>
	{@render children?.()}
</div>
