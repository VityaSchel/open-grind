<script lang="ts">
	import * as Item from "$lib/components/ui/item";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import { checkForUpdatesNow } from "$lib/updates/update-checks";

	let {
		selfManaged,
		addonAvailable,
	}: { selfManaged: boolean; addonAvailable: boolean } = $props();

	let checking = $state(false);

	async function check(): Promise<void> {
		if (checking) return;
		checking = true;
		try {
			await checkForUpdatesNow({ selfManaged, addonAvailable });
		} finally {
			checking = false;
		}
	}
</script>

<Item.Root
	variant="outline"
	class="cursor-pointer text-start hover:bg-muted disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
>
	{#snippet child({ props })}
		<button
			type="button"
			{...props}
			disabled={checking}
			aria-busy={checking}
			onclick={() => void check()}
		>
			<Item.Content class="max-cramped:min-w-0">
				<Item.Title class="inline-block max-w-full min-w-0 truncate">
					{t("updates.settings.checkNow")}
				</Item.Title>
			</Item.Content>
			{#if checking}
				<Item.Actions class="min-w-0">
					<Spinner aria-hidden="true" />
				</Item.Actions>
			{/if}
		</button>
	{/snippet}
</Item.Root>
