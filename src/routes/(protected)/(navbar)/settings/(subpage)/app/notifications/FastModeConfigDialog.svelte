<script lang="ts">
	import RadioList from "#lib/components/shared/RadioList.svelte";
	import RadioListItem from "#lib/components/shared/RadioListItem.svelte";
	import RadioMark from "#lib/components/shared/RadioMark.svelte";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Badge } from "#lib/components/ui/badge/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import {
		chooseFastSource,
		closeFastModeConfig,
	} from "#lib/push/delivery.svelte.ts";
	import { fastModeOptions } from "#lib/push/index.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import type { FastSource } from "#lib/push/types.ts";
	import RelayConfigAlert from "./RelayConfigAlert.svelte";

	let { onCloseAutoFocus }: { onCloseAutoFocus: (event: Event) => void } =
		$props();

	const DISTRIBUTORS_URL = "https://unifiedpush.org/users/distributors/";
	const NTFY_URL = "https://unifiedpush.org/users/distributors/ntfy/";
	const RELAY_URL = "https://git.opengrind.org/open-grind/fcm-relay";

	const optionTitleKeys = {
		addon: "settings.notifications.fastConfig.addon.title",
		relay: "settings.notifications.fastConfig.relay.title",
	} as const satisfies Record<FastSource, PlainMessageKey>;

	const descriptionIdPrefix = $props.id();

	let options = $state<HTMLElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);

	const locked = $derived(
		notificationSettings.busy || !notificationSettings.enabled,
	);

	dismissOnBackGesture({
		active: () => notificationSettings.configDialogOpen,
		dismiss: () => {},
	});

	export function focusAddonOption(): void {
		options
			?.querySelector<HTMLElement>('[role="radio"][data-value="addon"]')
			?.focus();
	}

	function focusCloseWhileCommitting(event: Event): void {
		if (!notificationSettings.committing) return;
		event.preventDefault();
		closeButton?.focus();
	}
</script>

{#snippet distributorsLink(text: string)}<Link href={DISTRIBUTORS_URL}
		>{text}</Link
	>{/snippet}
{#snippet ntfyLink(text: string)}<Link href={NTFY_URL}>{text}</Link>{/snippet}
{#snippet relayLink(text: string)}<Link href={RELAY_URL}>{text}</Link>{/snippet}

<AlertDialog.Root
	bind:open={
		() => notificationSettings.configDialogOpen,
		(next) => {
			if (!next) void closeFastModeConfig();
		}
	}
>
	<AlertDialog.Content
		class="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
		interactOutsideBehavior="ignore"
		escapeKeydownBehavior="ignore"
		{onCloseAutoFocus}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("settings.notifications.fastConfig.title")}
			</AlertDialog.Title>
		</AlertDialog.Header>
		<RadioList
			bind:ref={options}
			aria-label={t("settings.notifications.fastConfig.title")}
			disabled={locked}
			class="transition-opacity data-disabled:opacity-60"
			bind:value={() => notificationSettings.fastSource ?? "", () => {}}
		>
			{#each fastModeOptions() as source (source)}
				{@const loading = notificationSettings.pendingSource === source}
				{@const unavailable =
					source === "addon" &&
					notificationSettings.playServices === false}
				{@const descriptionId = `${descriptionIdPrefix}-${source}`}
				<div
					data-slot="fast-mode-option"
					class="not-first:border-t not-first:border-border"
				>
					<RadioListItem
						value={source}
						disabled={unavailable}
						aria-busy={loading}
						aria-describedby={descriptionId}
						class="pb-1.5"
						onclick={() => void chooseFastSource(source)}
						onkeydown={(event) => {
							if (event.key === " ")
								void chooseFastSource(source);
						}}
					>
						{#snippet children({ checked })}
							<Item.Content>
								<Item.Title>
									{t(optionTitleKeys[source])}
									{#if source === "addon" && notificationSettings.playServices !== null}
										<Badge
											variant="secondary"
											class={[
												"font-normal",
												{
													"text-primary":
														!unavailable,
													"text-muted-foreground":
														unavailable,
												},
											]}
										>
											{unavailable
												? t(
														"settings.notifications.fastConfig.addon.unavailable",
													)
												: t(
														"settings.notifications.mode.recommended",
													)}
										</Badge>
									{/if}
								</Item.Title>
							</Item.Content>
							<Item.Actions>
								{#if loading}
									<Spinner aria-hidden="true" />
								{:else}
									<RadioMark {checked} />
								{/if}
							</Item.Actions>
						{/snippet}
					</RadioListItem>
					<Item.Description
						id={descriptionId}
						class="line-clamp-none px-4 pb-3.5 text-wrap"
					>
						{#if source === "addon"}
							{t(
								"settings.notifications.fastConfig.addon.description",
							)}
						{:else if source === "relay"}
							<Rich
								key="settings.notifications.fastConfig.relay.description"
								{distributorsLink}
								{ntfyLink}
								{relayLink}
							/>
						{/if}
					</Item.Description>
				</div>
			{/each}
		</RadioList>
		<AlertDialog.Footer>
			<AlertDialog.Cancel bind:ref={closeButton} size="lg">
				{t("common.actions.close")}
			</AlertDialog.Cancel>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
<RelayConfigAlert onCloseAutoFocus={focusCloseWhileCommitting} />
