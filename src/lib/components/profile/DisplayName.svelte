<script lang="ts">
	let {
		name,
		fallback = "Someone",
		class: className,
	}: {
		name: string | null;
		fallback?: string;
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

{#if name}
	<span class={className}>{name}</span>
{:else}
	<span class={["font-normal tracking-tight italic", className]}
		>{fallback}</span
	>
{/if}
