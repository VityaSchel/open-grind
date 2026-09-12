<script lang="ts">
	import { CaretRightIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import * as Item from "$lib/components/ui/item";
	import { hapticsAvailable } from "$lib/haptics";
	import { desktopEntryAvailable } from "$lib/platform/desktop-entry.svelte";
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
				<Item.Content class="max-cramped:min-w-0">
					<Item.Title
						class="inline-block max-w-full min-w-0 truncate"
					>
						{title}
					</Item.Title>
				</Item.Content>
				<Item.Actions class="min-w-0">
					<CaretRightIcon class="size-4 shrink-0" />
				</Item.Actions>
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
		description="Play a short tap when a swipe has gone far enough to reply."
	/>
{/if}
{#if desktopEntryAvailable()}
	<AppsMenuEntrySetting />
{/if}
{@render item({
	title: "Notifications",
	unimplemented: { feature: "Notifications", issue: 45 },
})}
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
<h2>Security</h2>
{@render item({
	title: "Discreet app icon",
	unimplemented: { feature: "Discreet app icon", issue: 97 },
})}
{@render item({ title: "PIN", unimplemented: { feature: "PIN", issue: 50 } })}
{#if updatesSelfManaged() || updatesUnsupportedReason() !== null}
	<h2>Updates</h2>
	<AutomaticUpdatesSetting />
{/if}
<h2>About</h2>
<Item.Root variant="outline">
	{#snippet child({ props })}
		<a href="/settings/app/credits" {...props}>
			<Item.Content class="max-cramped:min-w-0">
				<Item.Title class="inline-block max-w-full min-w-0 truncate">
					Credits &amp; Licenses
				</Item.Title>
			</Item.Content>
			<Item.Actions class="min-w-0">
				<CaretRightIcon class="size-4 shrink-0" />
			</Item.Actions>
		</a>
	{/snippet}
</Item.Root>

<style lang="postcss">
	@reference "$layout";

	h2 {
		@apply mt-2 truncate ps-4 text-xl font-semibold tracking-tight;
	}
</style>
