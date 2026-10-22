<script lang="ts">
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import type { IconComponentProps } from "phosphor-svelte";

	import * as Item from "$lib/components/ui/item";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { t } from "$lib/i18n";
	import LanguageSetting from "./LanguageSetting.svelte";
	import { updateSettingsOffered } from "./updates/update-settings-offered";
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
			<a {href} {...props}>
				{@render rowContent({ title })}
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<LanguageSetting />
<span role="separator"></span>
{@render linkItem({
	title: t("settings.app.sections.display"),
	href: "/settings/app/display",
})}
{@render linkItem({
	title: t("settings.subpage.titles.notifications"),
	href: "/settings/app/notifications",
})}
{@render linkItem({
	title: t("settings.app.sections.privacy"),
	href: "/settings/app/privacy",
})}
{@render linkItem({
	title: t("settings.app.sections.security"),
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
