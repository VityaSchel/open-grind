<script lang="ts">
	import { onMount } from "svelte";

	import SelectionCheck from "$lib/components/shared/SelectionCheck.svelte";
	import * as Item from "$lib/components/ui/item";
	import { Spinner } from "$lib/components/ui/spinner";
	import { isPlayBuild } from "$lib/platform/store";
	import {
		loadNotificationSettings,
		notificationSettings,
		pushAddonInstalled,
		selectNotificationMode,
	} from "$lib/push/notifications.svelte";
	import { addonActivityOf } from "$lib/updates/addon.svelte";
	import { FCM_COMPONENT } from "$lib/updates/components";
	import type { NotificationMode } from "$lib/push/types";
	import PushAddonAlert from "./PushAddonAlert.svelte";

	const { fastOffered }: { fastOffered: boolean } = $props();

	const ADDON_RELEASES =
		"https://git.opengrind.org/open-grind/fcm-service/releases";
	const ADDON_GUIDE =
		"https://opengrind.org/guides/notifications#installing-the-fcm-service";
	const addonHref = isPlayBuild() ? ADDON_GUIDE : ADDON_RELEASES;

	const modes: {
		mode: NotificationMode;
		title: string;
		description: string;
	}[] = [
		{
			mode: "slow",
			title: "Battery friendly",
			description:
				"Open Grind checks for new messages by itself, without Google services. Android decides when it may run: about every 15 minutes while you use the app, but hours later once you stop, so notifications can be very late.",
		},
		{
			mode: "fast",
			title: "Instant",
			description:
				"Messages arrive the moment they are sent, through the Open Grind FCM service add-on. Needs Google Play services or microG on this device.",
		},
	];

	const installs = $derived(addonActivityOf(FCM_COMPONENT).installs);
	const busy = $derived(notificationSettings.phase === "working");

	onMount(() => void loadNotificationSettings());

	$effect(() => {
		void installs;
		void pushAddonInstalled();
	});
</script>

{#each modes as { mode, title, description } (mode)}
	{@const selected = notificationSettings.mode === mode}
	{@const offered = mode === "slow" || fastOffered}
	<Item.Root variant="outline">
		{#snippet child({ props })}
			<button
				type="button"
				disabled={busy || !offered}
				aria-pressed={selected}
				onclick={() => void selectNotificationMode(mode)}
				{...props}
			>
				<Item.Content>
					<Item.Title>{title}</Item.Title>
					<Item.Description class="text-wrap">
						{description}
					</Item.Description>
				</Item.Content>
				<Item.Actions>
					{#if busy && !selected}
						<Spinner />
					{:else if selected}
						<SelectionCheck />
					{/if}
				</Item.Actions>
			</button>
		{/snippet}
	</Item.Root>
{/each}
{#if notificationSettings.manualInstall}
	<p class="manual">
		This build can't install add-ons. <a
			href={addonHref}
			target="_blank"
			rel="noreferrer">Install the FCM service</a
		> yourself, then choose Instant again.
	</p>
{/if}
{#if notificationSettings.problem}
	<p role="alert">{notificationSettings.problem}</p>
{/if}
<PushAddonAlert />

<style lang="postcss">
	@reference "$layout";

	p {
		@apply px-4 text-sm text-destructive;
	}

	p.manual {
		@apply text-muted-foreground;
	}

	a {
		@apply underline;
	}
</style>
