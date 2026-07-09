<script lang="ts">
	import { getNow, subscribeNow } from "$lib/util/now.svelte";

	let {
		onlineUntil,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	$effect(() => subscribeNow());

	const online = $derived(onlineUntil != null && onlineUntil > getNow());
</script>

{#if online}
	<span
		class={[
			"inline-block size-2 shrink-0 rounded-full bg-green-500",
			className,
		]}
		aria-label="Online now"
		title="Online now"
	></span>
{/if}
