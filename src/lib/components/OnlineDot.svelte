<script lang="ts">
	import { getNow, subscribeNow } from "$lib/now.svelte";

	let {
		onlineUntil,
		isVisiting,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		isVisiting: boolean | null | undefined;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	$effect(() => subscribeNow());

	const online = $derived(onlineUntil != null && onlineUntil > getNow());
</script>

{#if isVisiting || online}
	<span class={[online ? "text-green-500" : "text-gray-400"]}>
		{#if isVisiting}
			<svg
				xmlns="http://www.w3.org/2000/svg"
				height="1em"
				width="1em"
				fill="currentColor"
				viewBox="0 -960 960 960"
			>
				<path
					d="m397-115-99-184-184-99 71-70 145 25 102-102-317-135 84-86 385 68 124-124q23-23 57-23t57 23q23 23 23 56.5T822-709L697-584l68 384-85 85-136-317-102 102 26 144-71 71Z"
				/>
			</svg>
		{:else if online}
			<span
				class={[
					"inline-block size-2 shrink-0 rounded-full bg-green-500",
					className,
				]}
				aria-label="Online now"
				title="Online now"
			></span>
		{/if}
	</span>
{/if}
