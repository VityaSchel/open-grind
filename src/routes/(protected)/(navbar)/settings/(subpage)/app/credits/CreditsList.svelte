<script lang="ts">
	import { ArrowSquareOutIcon } from "phosphor-svelte";

	import Link from "$lib/components/ui/link/Link.svelte";
	import type { Credits } from "$lib/credits";
	import CreditCard from "./CreditCard.svelte";
	import CreditRow from "./CreditRow.svelte";
	import { FrameCounter } from "./frame-counter.svelte";

	let { cards, groups }: Credits = $props();

	const ROWS_PER_BATCH = 40;

	const sections = $derived(
		groups.map(({ title, entries }) => ({
			title,
			batches: Array.from(
				{ length: Math.ceil(entries.length / ROWS_PER_BATCH) },
				(_, index) =>
					entries.slice(
						index * ROWS_PER_BATCH,
						(index + 1) * ROWS_PER_BATCH,
					),
			),
		})),
	);
	const batchesBefore = (index: number) =>
		sections
			.slice(0, index)
			.reduce((sum, section) => sum + section.batches.length, 0);
	const batchCount = $derived(batchesBefore(sections.length));
	const revealed = new FrameCounter({ total: () => batchCount });
</script>

<h2>Special thanks</h2>
{#each cards as card (card.ref.ecosystem + card.ref.id)}
	<CreditCard {card} />
{/each}

{#each sections as section, index (section.title)}
	{@const shownBatches = revealed.count - batchesBefore(index)}
	{#if shownBatches > 0}
		<section class="flex min-w-0 flex-col">
			<h2 class="mb-1">{section.title}</h2>
			{#each section.batches.slice(0, shownBatches) as batch, batchIndex (batchIndex)}
				{#each batch as entry (entry.ecosystem + entry.id + entry.spdx)}
					<CreditRow {entry} />
				{/each}
			{/each}
		</section>
	{/if}
{/each}

{#if revealed.count === batchCount}
	<Link
		href="https://git.opengrind.org/open-grind/open-grind/issues/new"
		class="mt-4 inline-flex items-center gap-1 self-start px-1 text-sm text-primary hover:underline"
	>
		Suggest an edit
		<ArrowSquareOutIcon class="size-3.5" />
	</Link>
{/if}

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-1 text-xl font-semibold tracking-tight;
	}
</style>
