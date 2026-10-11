<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import * as Item from "$lib/components/ui/item";
	import * as RadioGroup from "$lib/components/ui/radio-group";
	import { Spinner } from "$lib/components/ui/spinner";
	import { type PlainMessageKey, t } from "$lib/i18n";
	import { selectNotificationMode } from "$lib/push/delivery.svelte";
	import { notificationSettings } from "$lib/push/notification-state.svelte";
	import { cn } from "$lib/util/utils";
	import type { NotificationMode } from "$lib/push/types";
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

<RadioGroup.Root
	bind:ref={group}
	aria-label={t("settings.notifications.mode.a11y.group")}
	disabled={notificationSettings.busy || !notificationSettings.enabled}
	class="overflow-hidden rounded-2xl border border-border transition-opacity data-disabled:opacity-60"
	bind:value={
		() => notificationSettings.mode,
		(next) => void selectNotificationMode(next as NotificationMode)
	}
>
	{#each modes as { mode, recommended } (mode)}
		{@const enabling =
			mode === "fast" && notificationSettings.phase === "enablingFast"}
		<RadioGroup.Item
			value={mode}
			aria-busy={enabling}
			class={cn(
				Item.itemVariants(),
				"items-start rounded-none border-0 text-left not-first:border-t not-first:border-border focus-visible:ring-inset",
			)}
		>
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
<PushAddonAlert onCloseAutoFocus={focusSelectedMode} />
