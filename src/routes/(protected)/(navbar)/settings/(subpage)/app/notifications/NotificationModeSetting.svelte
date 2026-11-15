<script lang="ts">
	import RadioList from "#lib/components/shared/RadioList.svelte";
	import RadioListItem from "#lib/components/shared/RadioListItem.svelte";
	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import { Badge } from "#lib/components/ui/badge/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { selectNotificationMode } from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import type { NotificationMode } from "#lib/push/types.ts";
	import PushAddonAlert from "./PushAddonAlert.svelte";

	const modeKeys = {
		fast: {
			title: "settings.notifications.mode.fast.title",
			description: "settings.notifications.mode.fast.description",
		},
		slow: {
			title: "settings.notifications.mode.slow.title",
			description: "settings.notifications.mode.slow.description",
		},
	} as const satisfies Record<
		NotificationMode,
		Record<"title" | "description", PlainMessageKey>
	>;

	const modes: { mode: NotificationMode; recommended: boolean }[] = [
		{ mode: "fast", recommended: true },
		{ mode: "slow", recommended: false },
	];

	let group = $state<HTMLElement | null>(null);

	function focusSelectedMode(event: Event): void {
		event.preventDefault();
		group
			?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
			?.focus();
	}
</script>

<RadioList
	bind:ref={group}
	aria-label={t("settings.notifications.mode.a11y.group")}
	disabled={notificationSettings.busy || !notificationSettings.enabled}
	class="transition-opacity data-disabled:opacity-60"
	bind:value={
		() => notificationSettings.mode,
		(next) => void selectNotificationMode(next as NotificationMode)
	}
>
	{#each modes as { mode, recommended } (mode)}
		{@const enabling =
			mode === "fast" && notificationSettings.phase === "enablingFast"}
		<RadioListItem value={mode} aria-busy={enabling} class="items-start">
			{#snippet children({ checked })}
				<Item.Content>
					<Item.Title>
						{t(modeKeys[mode].title)}
						{#if recommended}
							<Badge
								variant="secondary"
								class="font-normal text-primary"
							>
								{t("settings.notifications.mode.recommended")}
							</Badge>
						{/if}
					</Item.Title>
					<Item.Description class="line-clamp-none text-wrap">
						{t(modeKeys[mode].description)}
					</Item.Description>
				</Item.Content>
				<Item.Actions class="self-start pt-0.5">
					{#if enabling}
						<Spinner aria-hidden="true" />
					{:else}
						<RadioMark {checked} />
					{/if}
				</Item.Actions>
			{/snippet}
		</RadioListItem>
	{/each}
</RadioList>
<PushAddonAlert onCloseAutoFocus={focusSelectedMode} />
