<script lang="ts">
	import { AirplaneTiltIcon } from "phosphor-svelte";

	import { getNow } from "$lib/util/now";

	let {
		onlineUntil,
		isVisiting,
		class: className,
	}: {
		onlineUntil: number | null | undefined;
		isVisiting?: boolean;
		class?: import("svelte/elements").ClassValue;
	} = $props();

	const online = $derived((onlineUntil ?? 0) > getNow());
	const title = $derived.by(() => {
		if (online && isVisiting) {
			return "Online now. Visiting";
		}
		if (online) {
			return "Online now";
		}
		if (isVisiting) {
			return "Visiting";
		}
	});
</script>

{#if isVisiting || online}
	<div
		class={[
			"flex shrink-0",
			{ "text-green-500": online, "text-gray-400": !online },
			className,
		]}
		aria-label={title}
		{title}
	>
		{#if isVisiting}
			<AirplaneTiltIcon weight="fill" class="size-3" />
		{:else}
			<span class="size-2 rounded-full bg-green-500"></span>
		{/if}
	</div>
{/if}
