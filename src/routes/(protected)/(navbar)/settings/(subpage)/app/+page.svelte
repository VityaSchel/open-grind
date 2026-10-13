<script lang="ts">
	import {
		ArrowSquareOutIcon,
		CaretRightIcon,
		type IconComponentProps,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { hapticsAvailable } from "$lib/haptics";
	import { t } from "$lib/i18n";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import { addonInstallerAvailable } from "$lib/updates/addon.svelte";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "$lib/updates/capability.svelte";
	import type { UnimplementedMessageKey } from "$lib/components/feedback/unimplemented";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import BackdropBlurSetting from "./BackdropBlurSetting.svelte";
	import LanguageSetting from "./LanguageSetting.svelte";
	import PreferenceSwitchSetting from "./PreferenceSwitchSetting.svelte";
	import UnitsSetting from "./UnitsSetting.svelte";
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
{#snippet item({
	title,
	unimplemented,
}: {
	title: string;
	unimplemented: { message: UnimplementedMessageKey; issue: number };
})}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<a
				href="#/"
				{...props}
				onclick={(event) => {
					event.preventDefault();
					toast(ToastUnimplemented, {
						componentProps: unimplemented,
					});
				}}
			>
				{@render rowContent({ title })}
			</a>
		{/snippet}
	</Item.Root>
{/snippet}
<h2>{t("settings.app.sections.display")}</h2>
<LanguageSetting />
<UnitsSetting />
<BackdropBlurSetting />
{#if hapticsAvailable()}
	<PreferenceSwitchSetting
		preference="hapticFeedback"
		title={t("settings.app.hapticFeedback.title")}
		description={t("settings.app.hapticFeedback.description")}
	/>
{/if}
{#if desktopEntryAvailable()}
	<AppsMenuEntrySetting />
{/if}
<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/app/notifications" {...props}>
			{@render rowContent({
				title: t("settings.subpage.titles.notifications"),
			})}
		</a>
	{/snippet}
</Item.Root>
<h2>{t("settings.app.sections.privacy")}</h2>
<PreferenceSwitchSetting
	preference="stayOnline"
	title={t("settings.app.stayOnline.title")}
	description={t("settings.app.stayOnline.description")}
/>
<PreferenceSwitchSetting
	preference="revealMessageRead"
	title={t("settings.app.revealMessageRead.title")}
	description={t("settings.app.revealMessageRead.description")}
/>
<PreferenceSwitchSetting
	preference="revealProfileViews"
	title={t("settings.app.revealProfileViews.title")}
	description={t("settings.app.revealProfileViews.description")}
/>
<h2>{t("settings.app.sections.security")}</h2>
{@render item({
	title: t("settings.app.discreetAppIcon.title"),
	unimplemented: {
		message: "settings.app.discreetAppIcon.unimplemented",
		issue: 97,
	},
})}
{@render item({
	title: t("settings.app.pin.title"),
	unimplemented: { message: "settings.app.pin.unimplemented", issue: 50 },
})}
{#if updatesSelfManaged() || updatesUnsupportedReason() !== null || addonInstallerAvailable()}
	<h2>{t("settings.app.sections.updates")}</h2>
	<AutomaticUpdatesSetting />
{/if}
<h2>{t("settings.app.sections.about")}</h2>
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
<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/app/credits" {...props}>
			{@render rowContent({
				title: t("settings.subpage.titles.credits"),
			})}
		</a>
	{/snippet}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}
</style>
