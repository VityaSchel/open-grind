<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import { ToggleGroup } from "bits-ui";

	import { showErrorToast } from "$lib/api/error-toast";
	import * as Item from "$lib/components/ui/item";
	import { getCatalogLocale, locales, t } from "$lib/i18n";
	import { languageNamesOf } from "$lib/i18n/language-names";
	import { pickerTag } from "$lib/i18n/matcher";
	import { chooseLanguage } from "$lib/platform/app-language";
	import { cn } from "$lib/util/utils";

	const languages = languageNamesOf(locales);

	let pending = $state<string | null>(null);
	let latestChoice = 0;
	let list = $state<HTMLElement | null>(null);
	const checked = $derived(pending ?? getCatalogLocale());

	afterNavigate(({ type }) => {
		if (type === "popstate") return;
		queueMicrotask(() => {
			list?.querySelector(
				'[data-slot="language-option"][aria-checked="true"]',
			)?.scrollIntoView({ block: "center" });
		});
	});

	function choose(catalog: string): void {
		if (catalog === "") return;
		const choice = ++latestChoice;
		pending = catalog;
		chooseLanguage({ tag: pickerTag(catalog) })
			.catch((error: unknown) => {
				showErrorToast({
					label: t("settings.setting.errors.saveFailed"),
					error,
				});
			})
			.finally(() => {
				if (choice === latestChoice) pending = null;
			});
	}
</script>

<ToggleGroup.Root
	type="single"
	orientation="vertical"
	aria-label={t("settings.subpage.titles.language")}
	class="flex flex-col overflow-hidden rounded-2xl border border-border"
	bind:ref={list}
	bind:value={() => checked, choose}
>
	{#each languages as { catalog, english, own } (catalog)}
		<ToggleGroup.Item
			value={catalog}
			data-slot="language-option"
			class={cn(
				Item.itemVariants(),
				"flex-nowrap rounded-none border-0 text-left not-first:border-t not-first:border-border focus-visible:ring-inset",
			)}
		>
			{#snippet children({ pressed })}
				<span
					data-slot="item-content"
					class="flex min-w-0 flex-1 flex-col gap-1"
				>
					<span
						data-slot="item-title"
						class="line-clamp-1 flex w-fit items-center gap-2 font-heading text-sm leading-snug font-medium underline-offset-4"
						lang="en"
						translate="no"
					>
						{english}
					</span>
					<span
						data-slot="item-description"
						class="line-clamp-1 text-left text-sm font-normal text-muted-foreground"
						lang={catalog}
						dir="auto"
						translate="no"
					>
						{own}
					</span>
				</span>
				<span data-slot="item-actions" class="flex items-center gap-2">
					<span
						class={[
							"flex size-5 items-center justify-center rounded-full border-2",
							{
								"border-primary": pressed,
								"border-muted-foreground/70": !pressed,
							},
						]}
					>
						{#if pressed}
							<span class="size-2.5 rounded-full bg-primary"
							></span>
						{/if}
					</span>
				</span>
			{/snippet}
		</ToggleGroup.Item>
	{/each}
</ToggleGroup.Root>
