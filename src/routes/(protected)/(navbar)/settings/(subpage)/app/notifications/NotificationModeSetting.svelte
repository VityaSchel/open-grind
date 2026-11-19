<script lang="ts">
	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import { Badge } from "#lib/components/ui/badge/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import { selectNotificationMode } from "#lib/push/delivery.svelte.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import { RovingFocusState } from "#lib/util/roving-focus-state.svelte.ts";
	import { cn } from "#lib/util/utils.ts";
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

	const roving = new RovingFocusState({
		keys: () => modes.map(({ mode }) => mode),
		orientation: "vertical",
		wrap: "loop",
		restingKey: () => notificationSettings.mode,
	});

	const locked = $derived(
		notificationSettings.busy || !notificationSettings.enabled,
	);

	function focusSelectedMode(event: Event): void {
		event.preventDefault();
		void roving.focus({ key: notificationSettings.mode });
	}
</script>

<div
	role="listbox"
	aria-label={t("settings.notifications.mode.a11y.group")}
	data-disabled={locked ? "" : undefined}
	class="flex w-full flex-col overflow-hidden rounded-2xl border border-border transition-opacity data-disabled:opacity-60"
	{@attach roving.container}
>
	{#each modes as { mode, recommended } (mode)}
		{@const enabling =
			mode === "fast" && notificationSettings.phase === "enablingFast"}
		{@const selected = notificationSettings.mode === mode}
		<button
			type="button"
			role="option"
			aria-selected={selected}
			aria-disabled={locked}
			aria-busy={enabling}
			class={cn(
				Item.itemVariants(),
				"items-start rounded-none border-0 text-left -outline-offset-2 not-first:border-t not-first:border-border first:rounded-t-[inherit] last:rounded-b-[inherit]",
			)}
			onclick={() => {
				if (!locked) void selectNotificationMode(mode);
			}}
			{@attach roving.item(mode)}
		>
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
					<RadioMark checked={selected} />
				{/if}
			</Item.Actions>
		</button>
	{/each}
</div>
<PushAddonAlert onCloseAutoFocus={focusSelectedMode} />
