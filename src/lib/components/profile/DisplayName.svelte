<script lang="ts">
	let {
		name,
		class: className,
	}: { name: string | null; class?: import("svelte/elements").ClassValue } =
		$props();
</script>

{#if name}
	<span class={className}>{name}</span>
{:else}
	<span class={["font-normal tracking-tight italic", className]}>Someone</span
	>
{/if}
