<script lang="ts">
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import type { IconComponentProps } from "phosphor-svelte";

	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { hapticsAvailable } from "#lib/haptics.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { currentPlatform } from "#lib/platform/os.ts";
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
			case "freebsd":
			case "dragonfly":
			case "netbsd":
			case "openbsd":
			case "solaris":
			case "web":
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
			case "freebsd":
			case "dragonfly":
			case "netbsd":
			case "openbsd":
			case "solaris":
			case "web":
				return "settings.app.sectionDescriptions.security.iconOnly";
		}
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
			>
				{@render rowContent({ title, description, id })}
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<LanguageSetting />
<span role="separator"></span>
{@render linkItem({
	title: t("settings.app.sections.display"),
	description: hapticsAvailable()
		? t("settings.app.sectionDescriptions.display.withHaptics")
		: t("settings.app.sectionDescriptions.display.withoutHaptics"),
	href: "/settings/app/display",
})}
{#if notificationsDescription !== null}
	{@render linkItem({
		title: t("settings.subpage.titles.notifications"),
		description: t(notificationsDescription),
		href: "/settings/app/notifications",
	})}
{/if}
{@render linkItem({
	title: t("settings.app.sections.privacy"),
	description: t("settings.app.sectionDescriptions.privacy"),
	href: "/settings/app/privacy",
})}
{@render linkItem({
	title: t("settings.app.sections.security"),
	description: t(securityDescription),
	href: "/settings/app/security",
})}
{#if updateSettingsOffered()}
	{@render linkItem({
		title: t("settings.app.sections.updates"),
		href: "/settings/app/updates",
	})}
{/if}
<span role="separator"></span>
<Item.Root variant="outline">
	{#snippet child({ props })}
		<Link href="https://opengrind.org/privacy" {...props}>
			{@render rowContent({
				title: t("settings.app.privacyPolicy"),
				trailingIcon: ArrowSquareOutIcon,
			})}
		</Link>
	{/snippet}
</Item.Root>
{@render linkItem({
	title: t("settings.subpage.titles.credits"),
	href: "/settings/app/credits",
})}
