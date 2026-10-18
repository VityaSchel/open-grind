<script lang="ts">
	import ArrowSquareOutIcon from "phosphor-svelte/lib/ArrowSquareOutIcon";
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import { toast } from "svelte-sonner";
	import type { IconComponentProps } from "phosphor-svelte";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
	import Link from "$lib/components/ui/link/Link.svelte";
	import { hapticsAvailable } from "$lib/haptics";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
	import { addonInstallerAvailable } from "$lib/updates/addon.svelte";
	import {
		updatesSelfManaged,
		updatesUnsupportedReason,
	} from "$lib/updates/capability.svelte";
	import AppsMenuEntrySetting from "./AppsMenuEntrySetting.svelte";
	import AutomaticUpdatesSetting from "./AutomaticUpdatesSetting.svelte";
	import BackdropBlurSetting from "./BackdropBlurSetting.svelte";
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
	unimplemented: { feature: string; issue: number };
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
<h2>Display</h2>
<UnitsSetting />
<BackdropBlurSetting />
{#if hapticsAvailable()}
	<PreferenceSwitchSetting
		preference="hapticFeedback"
		title="Haptic feedback"
		description="Use the haptic engine for interactions."
	/>
{/if}
{#if desktopEntryAvailable()}
	<AppsMenuEntrySetting />
{/if}
<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/app/notifications" {...props}>
			{@render rowContent({ title: "Notifications" })}
		</a>
	{/snippet}
</Item.Root>
<h2>Privacy</h2>
<PreferenceSwitchSetting
	preference="stayOnline"
	title="Stay online while the app is open"
	description="Refresh your online status in the background automatically, while the app is open."
/>
<PreferenceSwitchSetting
	preference="revealMessageRead"
	title="Reveal message read status"
	description="Let others know when you've read their messages. Your read receipts remain unaffected."
/>
<PreferenceSwitchSetting
	preference="revealProfileViews"
	title="Reveal profile views"
	description="Let others know when you've viewed their profile. Your profile view history remains unaffected."
/>
<PreferenceSwitchSetting
	preference="giphyConsent"
	title="GIF search via GIPHY"
	description="Search and load GIFs from GIPHY in chats. GIPHY sees your IP address, what you search for and that the requests come from a Grindr app."
/>
<h2>Security</h2>
{@render item({
	title: "Discreet app icon",
	unimplemented: { feature: "Discreet app icon", issue: 97 },
})}
{@render item({ title: "PIN", unimplemented: { feature: "PIN", issue: 50 } })}
{#if updatesSelfManaged() || updatesUnsupportedReason() !== null || addonInstallerAvailable()}
	<h2>Updates</h2>
	<AutomaticUpdatesSetting />
{/if}
<h2>About</h2>
<Item.Root variant="outline">
	{#snippet child({ props })}
		<Link href="https://opengrind.org/privacy" {...props}>
			{@render rowContent({
				title: "Privacy policy",
				trailingIcon: ArrowSquareOutIcon,
			})}
		</Link>
	{/snippet}
</Item.Root>
<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/app/credits" {...props}>
			{@render rowContent({ title: "Credits & Licenses" })}
		</a>
	{/snippet}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}
</style>
