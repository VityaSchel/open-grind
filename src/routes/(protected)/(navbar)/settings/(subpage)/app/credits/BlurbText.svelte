<script lang="ts">
	import Link from "$lib/components/ui/link/Link.svelte";
	import Rich from "$lib/i18n/Rich.svelte";
	import type { HighlightBlurbKey } from "$lib/credits/types";

	let {
		name,
		blurb,
		url,
	}: { name: string; blurb?: HighlightBlurbKey; url?: string } = $props();
</script>

{#snippet project(text: string)}
	{#if url}<Link href={url} class="font-semibold hover:underline">{text}</Link
		>{:else}<span class="font-semibold">{text}</span>{/if}
{/snippet}

<p class="text-sm wrap-anywhere text-muted-foreground">
	{#if blurb}<Rich key={blurb} {name} {project} />{:else}{@render project(
			name,
		)}{/if}
</p>
