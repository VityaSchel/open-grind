<script lang="ts">
	import { page } from "$app/state";
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import type { IconComponentProps } from "phosphor-svelte";

	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import LanguageSetting from "./LanguageSetting.svelte";
	import { updateSettingsOffered } from "./updates/update-settings-offered";

	const LANGUAGE = "/settings/app/language";
	const PRIVACY_POLICY = "https://opengrind.org/privacy";
	const CREDITS = "/settings/app/credits";

	const subscreens = $derived([
		{
			title: t("settings.app.sections.display"),
			href: "/settings/app/display",
		},
		{
			title: t("settings.subpage.titles.notifications"),
			href: "/settings/app/notifications",
		},
		{
			title: t("settings.app.sections.privacy"),
			href: "/settings/app/privacy",
		},
		{
			title: t("settings.app.sections.security"),
			href: "/settings/app/security",
		},
		...(updateSettingsOffered()
			? [
					{
						title: t("settings.app.sections.updates"),
						href: "/settings/app/updates",
					},
				]
			: []),
	]);
	const keys = $derived([
		LANGUAGE,
		...subscreens.map(({ href }) => href),
		PRIVACY_POLICY,
		CREDITS,
	]);

	const links = new RovingFocusState({
		keys: () => keys,
		orientation: "both",
		openerScope: page.url.pathname,
	});
</script>

{#snippet rowContent({
	title,
	trailingIcon: TrailingIcon = CaretRightIcon,
}: {
	title: string;
	trailingIcon?: import("svelte").Component<IconComponentProps>;
})}
	<Item.Content class="max-cramped:min-w-0">
		<Item.Title class="inline-block max-w-full min-w-0 truncate">
			{title}
		</Item.Title>
	</Item.Content>
	<Item.Actions class="min-w-0">
		<TrailingIcon class="size-4 shrink-0" />
	</Item.Actions>
{/snippet}
{#snippet linkItem({ title, href }: { title: string; href: string })}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a {href} {...props} {@attach links.item(href)}>
				{@render rowContent({ title })}
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<div class="contents" {@attach links.container}>
	<LanguageSetting {@attach links.item(LANGUAGE)} />
	<span role="separator"></span>
	{#each subscreens as subscreen (subscreen.href)}
		{@render linkItem(subscreen)}
	{/each}
	<span role="separator"></span>
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<Link
				href={PRIVACY_POLICY}
				{...props}
				{@attach links.item(PRIVACY_POLICY)}
			>
				{@render rowContent({
					title: t("settings.app.privacyPolicy"),
					trailingIcon: ArrowSquareOutIcon,
				})}
			</Link>
		{/snippet}
	</Item.Root>
	{@render linkItem({
		title: t("settings.subpage.titles.credits"),
		href: CREDITS,
	})}
</div>
