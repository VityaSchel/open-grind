<script lang="ts">
	import { t } from "$lib/i18n";

	let {
		name,
		fallback,
		class: className,
	}: {
		name: string | null;
		fallback?: string;
		class?: import("svelte/elements").ClassValue;
	} = $props();
</script>

{#if name}
	<span class={className} translate="no">{name}</span>
{:else}
	<span class={["font-normal tracking-tight italic", className]}
		>{fallback ?? t("common.someone")}</span
	>
{/if}
