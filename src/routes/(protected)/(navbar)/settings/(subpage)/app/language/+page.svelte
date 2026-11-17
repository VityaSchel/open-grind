<script lang="ts">
	import { afterNavigate } from "$app/navigation";
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";

	import { showErrorToast } from "#lib/api/error-toast.ts";
	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { helpTranslateUrl } from "#lib/i18n/help-translate.ts";
	import { t } from "#lib/i18n/index.ts";
	import {
		getListedLanguage,
		listedLanguages,
	} from "#lib/i18n/listed-languages.ts";
	import { pickerTag } from "#lib/i18n/matcher.ts";
	import {
		chooseLanguage,
		getSystemLanguages,
	} from "#lib/platform/app-language.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { cn } from "#lib/util/utils.ts";

	const translateUrl = helpTranslateUrl({ system: getSystemLanguages() });

	let pending = $state<string | null>(null);
	let latestChoice = 0;
	let list = $state<HTMLElement | null>(null);
	const checked = $derived(pending ?? getListedLanguage().catalog);

	const roving = new RovingFocusState({
		keys: () => listedLanguages.map(({ catalog }) => catalog),
		orientation: "vertical",
		wrap: "loop",
		restingKey: () => checked,
		stopTabindex: "explicit",
		typeahead: (option) =>
			option.querySelector('[data-slot="item-title"]')?.textContent ?? "",
	});

	afterNavigate(({ type }) => {
		if (type === "popstate") return;
		queueMicrotask(() => {
			list?.querySelector(
				'[data-slot="language-option"][aria-selected="true"]',
			)?.scrollIntoView({ block: "center" });
		});
	});

	function choose(catalog: string): void {
		if (catalog === checked) return;
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

<div
	role="listbox"
	aria-label={t("settings.subpage.titles.language")}
	class="flex flex-col overflow-hidden rounded-2xl border border-border"
	bind:this={list}
	{@attach roving.container}
>
	{#each listedLanguages as { catalog, english, own } (catalog)}
		<button
			type="button"
			role="option"
			aria-selected={catalog === checked}
			data-slot="language-option"
			class={cn(
				Item.itemVariants(),
				"flex-nowrap rounded-none border-0 text-left -outline-offset-2 not-first:border-t not-first:border-border first:rounded-t-[calc(var(--radius-2xl)_-_1px)] last:rounded-b-[calc(var(--radius-2xl)_-_1px)]",
			)}
			onclick={() => choose(catalog)}
			{@attach roving.item(catalog)}
		>
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
				<RadioMark checked={catalog === checked} />
			</span>
		</button>
	{/each}
</div>
<Link
	href={translateUrl}
	data-slot="help-translate"
	class="inline-flex items-center gap-1 self-start px-4 text-sm text-muted-foreground hover:text-foreground"
>
	{t("settings.app.language.helpTranslate")}
	<ArrowSquareOutIcon class="size-3.5" />
</Link>
