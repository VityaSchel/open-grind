<script lang="ts">
	import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import { itemVariants } from "$lib/components/ui/item";
	import * as RadioGroup from "$lib/components/ui/radio-group";
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
	import { cn } from "$lib/util/utils";
	import type { NotificationMode } from "$lib/push/types";
	import PushAddonAlert from "./PushAddonAlert.svelte";

	const ADDON_RELEASES =
		"https://git.opengrind.org/open-grind/fcm-service/releases";
	const ADDON_GUIDE =
		"https://opengrind.org/guides/notifications#installing-the-fcm-service";
	const addonHref = isPlayBuild() ? ADDON_GUIDE : ADDON_RELEASES;

	const modes: {
		mode: NotificationMode;
		title: string;
		description: string;
		recommended?: boolean;
	}[] = [
		{
			mode: "fast",
			title: "Fast mode",
			description:
				"Use Google's Firebase proprietary service to receive push notifications instantly",
			recommended: true,
		},
		{
			mode: "slow",
			title: "Slow mode",
			description:
				"Poll for new notifications periodically in the background using Android's native scheduler",
		},
	];

	const installs = $derived(addonActivityOf(FCM_COMPONENT).installs);
	const busy = $derived(notificationSettings.phase === "working");

	$effect(() => {
		if (appLifecycle.active) void loadNotificationSettings();
	});

	$effect(() => {
		void installs;
		void pushAddonInstalled();
	});
</script>

<RadioGroup.Root
	aria-labelledby="delivery-heading"
	disabled={busy}
	class="overflow-hidden rounded-2xl border border-border"
	bind:value={
		() => notificationSettings.mode,
		(next) => void selectNotificationMode(next as NotificationMode)
	}
>
	{#each modes as { mode, title, description, recommended } (mode)}
		<RadioGroup.Item
			value={mode}
			class={cn(
				itemVariants(),
				"items-start rounded-none border-0 text-left not-first:border-t not-first:border-border focus-visible:ring-inset",
			)}
		>
			{#snippet children({ checked })}
				<Item.Content>
					<Item.Title>
						{title}
						{#if recommended}
							<Badge
								variant="secondary"
								class="font-normal text-primary"
							>
								Recommended
							</Badge>
						{/if}
					</Item.Title>
					<Item.Description class="line-clamp-none text-wrap">
						{description}
					</Item.Description>
				</Item.Content>
				<Item.Actions class="self-start pt-0.5">
					{#if busy && !checked}
						<Spinner />
					{:else}
						<span
							class={[
								"flex size-5 items-center justify-center rounded-full border-2",
								{
									"border-primary": checked,
									"border-muted-foreground/70": !checked,
								},
							]}
						>
							{#if checked}
								<span class="size-2.5 rounded-full bg-primary"
								></span>
							{/if}
						</span>
					{/if}
				</Item.Actions>
			{/snippet}
		</RadioGroup.Item>
	{/each}
</RadioGroup.Root>
{#if notificationSettings.manualInstall}
	<p class="manual">
		This build can't install add-ons. <a
			href={addonHref}
			target="_blank"
			rel="noreferrer">Install the FCM service</a
		> yourself, then choose Fast mode again.
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
