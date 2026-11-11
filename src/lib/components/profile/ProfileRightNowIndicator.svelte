<script lang="ts">
	import HouseIcon from "phosphor-svelte/lib/HouseIcon";

	import SplashIcon from "#lib/components/right-now/SplashIcon.svelte";
	import type { RightNowStatus } from "#lib/model/right-now/index.ts";

	let {
		status,
		class: className,
		iconClass = "size-3",
	}: {
		status: RightNowStatus;
		class?: import("svelte/elements").ClassValue;
		iconClass?: import("svelte/elements").ClassValue;
	} = $props();

	const title = $derived(
		status === "HOSTING" ? "Right Now · Hosting" : "Right Now",
	);
</script>

{#if status !== "NOT_ACTIVE"}
	<div
		data-slot="right-now-indicator"
		class={["flex shrink-0 text-purple-400", className]}
		{title}
	>
		{#if status === "HOSTING"}
			<HouseIcon weight="fill" class={iconClass} />
		{:else}
			<SplashIcon weight="fill" class={iconClass} />
		{/if}
		<span class="sr-only">{title}</span>
	</div>
{/if}
