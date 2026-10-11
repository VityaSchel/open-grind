<script lang="ts">
	import { Skeleton } from "$lib/components/ui/skeleton";
	import { loadCredits } from "$lib/credits";
	import { t } from "$lib/i18n";
	import CreditsList from "./CreditsList.svelte";

	const credits = loadCredits();
</script>

{#await credits}
	<div class="flex flex-col gap-3">
		{#each Array.from({ length: 6 })}
			<Skeleton class="h-24 w-full rounded-2xl" />
		{/each}
	</div>
{:then { cards, groups }}
	<CreditsList {cards} {groups} />
{:catch}
	<p class="px-1 py-8 text-center text-destructive">
		{t("settings.credits.errors.loadFailed")}
	</p>
{/await}
