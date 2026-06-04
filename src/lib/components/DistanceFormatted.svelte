<script lang="ts">
	let { distance }: { distance: number } = $props();
</script>

{#if distance < 1000}
	{Math.round(distance)} m
{:else}
	{(distance / 1000).toFixed(1)} km
{/if}
