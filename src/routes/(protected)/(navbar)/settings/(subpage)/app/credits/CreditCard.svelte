<script lang="ts">
	import type { HighlightCard } from "$lib/credits";
	import BlurbText from "./BlurbText.svelte";
	import LicenseDisclosure from "./LicenseDisclosure.svelte";

	let { card }: { card: HighlightCard } = $props();
</script>

<div class="flex min-w-0 flex-col gap-1 px-1" data-slot="credit-card">
	<BlurbText name={card.name} blurb={card.blurb} url={card.url} />
	{#if card.entry}
		<LicenseDisclosure entry={card.entry} />
	{/if}
</div>
