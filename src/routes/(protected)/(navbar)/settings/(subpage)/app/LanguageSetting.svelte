<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";

	import * as Item from "$lib/components/ui/item";
	import { getCatalogLocale, t } from "$lib/i18n";
	import { languageName } from "$lib/i18n/language-names";

	const current = $derived(languageName(getCatalogLocale()));
</script>

<Item.Root variant="outline" class="flex-nowrap">
	{#snippet child({ props })}
		<a href="/settings/app/language" {...props}>
			<Item.Content class="min-w-0 flex-initial">
				<Item.Title class="inline-block max-w-full min-w-0 truncate">
					{t("settings.subpage.titles.language")}
				</Item.Title>
			</Item.Content>
			<Item.Actions class="min-w-0 flex-auto justify-end">
				<span
					class="min-w-0 truncate text-muted-foreground"
					data-slot="language-setting-current"
					lang={current.catalog}
					dir="auto"
					translate="no"
				>
					{current.own}
				</span>
				<CaretRightIcon class="size-4 shrink-0" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>
