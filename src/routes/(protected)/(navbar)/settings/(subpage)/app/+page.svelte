<script lang="ts">
	import { page } from "$app/state";
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import type { IconComponentProps } from "phosphor-svelte";

	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { hapticsAvailable } from "#lib/haptics.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { currentPlatform } from "#lib/platform/os.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import LanguageSetting from "./LanguageSetting.svelte";
	import { updateSettingsOffered } from "./updates/update-settings-offered";

	const rowId = $props.id();

	const notificationsDescription = $derived.by((): PlainMessageKey | null => {
		switch (currentPlatform()) {
			case "android":
				return "settings.app.sectionDescriptions.notifications.android";
			case "macos":
			case "windows":
			case "linux":
				return "settings.app.sectionDescriptions.notifications.desktop";
			case "ios":
				return null;
		}
	});

	const securityDescription = $derived.by((): PlainMessageKey => {
		switch (currentPlatform()) {
			case "android":
			case "macos":
			case "windows":
			case "linux":
				return "settings.app.sectionDescriptions.security.iconAndName";
			case "ios":
				return "settings.app.sectionDescriptions.security.iconOnly";
		}
	});

	const LANGUAGE = "/settings/app/language";
	const PRIVACY_POLICY = "https://opengrind.org/privacy";
	const CREDITS = "/settings/app/credits";

	const subscreens = $derived([
		{
			title: t("settings.app.sections.display"),
			description: hapticsAvailable()
				? t("settings.app.sectionDescriptions.display.withHaptics")
				: t("settings.app.sectionDescriptions.display.withoutHaptics"),
			href: "/settings/app/display",
		},
		...(notificationsDescription === null
			? []
			: [
					{
						title: t("settings.subpage.titles.notifications"),
						description: t(notificationsDescription),
						href: "/settings/app/notifications",
					},
				]),
		{
			title: t("settings.app.sections.privacy"),
			description: t("settings.app.sectionDescriptions.privacy"),
			href: "/settings/app/privacy",
		},
		{
			title: t("settings.app.sections.security"),
			description: t(securityDescription),
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
	description,
	id,
	trailingIcon: TrailingIcon = CaretRightIcon,
}: {
	title: string;
	description?: string;
	id?: string;
	trailingIcon?: import("svelte").Component<IconComponentProps>;
})}
	<Item.Content class="max-cramped:min-w-0">
		<Item.Title
			id={id && `${id}-title`}
			class="inline-block max-w-full min-w-0 truncate"
		>
			{title}
		</Item.Title>
		{#if description}
			<Item.Description
				id={id && `${id}-description`}
				class="inline-block max-w-full min-w-0 truncate"
			>
				{description}
			</Item.Description>
		{/if}
	</Item.Content>
	<Item.Actions class="min-w-0">
		<TrailingIcon class="size-4 shrink-0" />
	</Item.Actions>
{/snippet}
{#snippet linkItem({
	title,
	description,
	href,
}: {
	title: string;
	description?: string;
	href: string;
})}
	{@const id = `${rowId}-${href.slice(href.lastIndexOf("/") + 1)}`}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				{href}
				{...props}
				aria-labelledby="{id}-title"
				aria-describedby={description && `${id}-description`}
				{@attach links.item(href)}
			>
				{@render rowContent({ title, description, id })}
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
