<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	import Link from "#lib/components/ui/link/Link.svelte";
	import Rich from "#lib/i18n/Rich.svelte";
	import type { HighlightBlurbKey } from "#lib/credits/types.ts";

	let {
		name,
		blurb,
		url,
		linkAttachment,
	}: {
		name: string;
		blurb?: HighlightBlurbKey;
		url?: string;
		linkAttachment?: Attachment<HTMLElement>;
	} = $props();
</script>

{#snippet projectLink()}
	{#if url}<Link
			href={url}
			class="font-semibold hover:underline"
			translate="no"
			{@attach linkAttachment}>{name}</Link
		>{:else}<span class="font-semibold" translate="no">{name}</span>{/if}
{/snippet}

<p class="text-sm wrap-anywhere text-muted-foreground">
	{#if blurb}<Rich
			key={blurb}
			{projectLink}
		/>{:else}{@render projectLink()}{/if}
</p>
