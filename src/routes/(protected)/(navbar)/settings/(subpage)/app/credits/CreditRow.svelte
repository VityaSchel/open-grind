<script lang="ts">
	import type { Attachment } from "svelte/attachments";

	import type { LoadedEntry } from "#lib/credits/index.ts";
	import BlurbText from "./BlurbText.svelte";
	import LicenseDisclosure from "./LicenseDisclosure.svelte";

	let {
		entry,
		linkAttachment,
		summaryAttachment,
	}: {
		entry: LoadedEntry;
		linkAttachment?: Attachment<HTMLElement>;
		summaryAttachment?: Attachment<HTMLElement>;
	} = $props();
</script>

<div
	class="flex min-w-0 flex-col gap-0.5 px-1 py-1.5"
	data-slot="credit-row"
	data-offscreen-skip
	style:--offscreen-block-size="2.65625rem"
>
	<BlurbText name={entry.name} url={entry.url} {linkAttachment} />
	<LicenseDisclosure {entry} {summaryAttachment} />
</div>
