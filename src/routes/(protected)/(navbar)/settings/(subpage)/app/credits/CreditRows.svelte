<script lang="ts">
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import type { LoadedEntry } from "#lib/credits/index.ts";
	import CreditRow from "./CreditRow.svelte";

	let { batches, revealed }: { batches: LoadedEntry[][]; revealed: boolean } =
		$props();

	function rowKey({ ecosystem, id, spdx }: LoadedEntry): string {
		return `${ecosystem}:${id}:${spdx}`;
	}

	const keys = $derived(
		batches
			.flat()
			.flatMap((entry) => [
				...(entry.url ? [`${rowKey(entry)}:link`] : []),
				...(entry.texts.length > 0 ? [`${rowKey(entry)}:license`] : []),
			]),
	);

	const rows = new RovingFocusState({
		keys: () => keys,
		orientation: "vertical",
		typeahead: (item) =>
			item instanceof HTMLAnchorElement ? item.textContent : "",
	});
</script>

<div class="flex min-w-0 flex-col" {@attach revealed && rows.container}>
	{#each batches as batch, batchIndex (batchIndex)}
		{#each batch as entry (rowKey(entry))}
			<CreditRow
				{entry}
				linkAttachment={revealed
					? rows.item(`${rowKey(entry)}:link`)
					: undefined}
				summaryAttachment={revealed
					? rows.item(`${rowKey(entry)}:license`)
					: undefined}
			/>
		{/each}
	{/each}
</div>
