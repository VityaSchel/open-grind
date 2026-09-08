<script lang="ts">
	import { ArrowSquareOutIcon } from "phosphor-svelte";

	import Link from "$lib/components/ui/link/Link.svelte";
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { loadCredits } from "$lib/credits";
	import CreditCard from "./CreditCard.svelte";
	import CreditRow from "./CreditRow.svelte";

	const credits = loadCredits();
</script>

{#await credits}
	<div class="flex flex-col gap-3">
		{#each Array.from({ length: 6 })}
			<Skeleton class="h-24 w-full rounded-2xl" />
		{/each}
	</div>
{:then { cards, groups }}
	<h2>Special thanks</h2>
	{#each cards as card (card.ref.ecosystem + card.ref.id)}
		<CreditCard {card} />
	{/each}

	{#each groups as group (group.title)}
		<section class="flex min-w-0 flex-col">
			<h2 class="mb-1">{group.title}</h2>
			{#each group.entries as entry (entry.ecosystem + entry.id + entry.spdx)}
				<CreditRow {entry} />
			{/each}
		</section>
	{/each}

	<Link
		href="https://git.opengrind.org/open-grind/open-grind/issues/new"
		class="mt-4 inline-flex items-center gap-1 self-start px-1 text-sm text-primary hover:underline"
	>
		Suggest an edit
		<ArrowSquareOutIcon class="size-3.5" />
	</Link>
{:catch}
	<p class="px-1 py-8 text-center text-destructive">
		Failed to load the credits. Please try again.
	</p>
{/await}

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-1 text-xl font-semibold tracking-tight;
	}
</style>
