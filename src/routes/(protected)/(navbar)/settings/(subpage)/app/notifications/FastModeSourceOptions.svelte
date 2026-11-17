<script lang="ts">
	import CaretRightIcon from "phosphor-svelte/lib/CaretRightIcon";
	import CheckIcon from "phosphor-svelte/lib/CheckIcon";

	import { Badge } from "#lib/components/ui/badge/index.ts";
	import { Button, buttonVariants } from "#lib/components/ui/button/index.ts";
	import * as Item from "#lib/components/ui/item/index.ts";
	import Link from "#lib/components/ui/link/Link.svelte";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
	import Rich from "#lib/i18n/Rich.svelte";
	import { chooseFastSource } from "#lib/push/delivery.svelte.ts";
	import { fastModeOptions } from "#lib/push/index.ts";
	import { notificationSettings } from "#lib/push/notification-state.svelte.ts";
	import { cn } from "#lib/util/utils.ts";
	import type { FastSource } from "#lib/push/types.ts";

	let { onSetupGone }: { onSetupGone: () => void } = $props();

	const DISTRIBUTORS_URL = "https://unifiedpush.org/users/distributors/";
	const NTFY_URL = "https://unifiedpush.org/users/distributors/ntfy/";
	const RELAY_URL = "https://git.opengrind.org/open-grind/fcm-relay";

	const optionTitleKeys = {
		addon: "settings.notifications.fastConfig.addon.title",
		relay: "settings.notifications.fastConfig.relay.title",
	} as const satisfies Record<FastSource, PlainMessageKey>;

	const idPrefix = $props.id();

	let options = $state<HTMLElement | null>(null);

	const locked = $derived(
		notificationSettings.busy || !notificationSettings.enabled,
	);
	const addonInUse = $derived(
		notificationSettings.fastSource === "addon" &&
			notificationSettings.mode === "fast",
	);

	$effect.pre(() => {
		if (!addonInUse) return;
		const focused = document.activeElement;
		if (focused === document.body || focused === setupButton("addon"))
			queueMicrotask(onSetupGone);
	});

	export function focusSetup(source: FastSource): void {
		setupButton(source)?.focus();
	}

	export function focusFirstSetup(): boolean {
		const target = options?.querySelector<HTMLButtonElement>(
			'[data-slot="fast-mode-option"] button:enabled',
		);
		target?.focus();
		return Boolean(target);
	}

	function setupButton(source: FastSource): HTMLButtonElement | null {
		return (
			options?.querySelector<HTMLButtonElement>(
				`[data-slot="fast-mode-option"][data-source="${source}"] button`,
			) ?? null
		);
	}
</script>

{#snippet distributorsLink(text: string)}<Link href={DISTRIBUTORS_URL}
		>{text}</Link
	>{/snippet}
{#snippet ntfyLink(text: string)}<Link href={NTFY_URL}>{text}</Link>{/snippet}
{#snippet relayLink(text: string)}<Link href={RELAY_URL}>{text}</Link>{/snippet}

<ul
	bind:this={options}
	aria-label={t("settings.notifications.fastConfig.title")}
	class="overflow-hidden rounded-2xl border border-border"
>
	{#each fastModeOptions() as source (source)}
		{@const modifies =
			source === "relay" && notificationSettings.fastSource === "relay"}
		{@const loading = notificationSettings.pendingSource === source}
		{@const unavailable =
			source === "addon" && notificationSettings.playServices === false}
		{@const headingId = `${idPrefix}-${source}-heading`}
		{@const descriptionId = `${idPrefix}-${source}-description`}
		<li
			data-slot="fast-mode-option"
			data-source={source}
			data-disabled={unavailable || undefined}
			class="flex flex-col items-start gap-3 px-4 py-3.5 transition-opacity not-first:border-t not-first:border-border data-disabled:opacity-60"
		>
			<div class="flex flex-col gap-1">
				<div id={headingId} class="flex flex-wrap items-center gap-2">
					<h3 class="font-heading text-sm leading-snug font-medium">
						{t(optionTitleKeys[source])}
					</h3>
					{#if source === "addon" && notificationSettings.playServices !== null}
						<Badge
							variant="secondary"
							class="font-normal text-primary"
						>
							{t("settings.notifications.mode.recommended")}
						</Badge>
					{/if}
				</div>
				<Item.Description
					id={descriptionId}
					class="line-clamp-none text-wrap"
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
			{#if unavailable}
				<span
					data-slot="fast-mode-option-status"
					class={cn(
						buttonVariants({ variant: "secondary", size: "sm" }),
						"pointer-events-none",
					)}
				>
					{t("settings.notifications.fastConfig.addon.unavailable")}
				</span>
			{:else if source === "addon" && addonInUse}
				<span
					data-slot="fast-mode-option-status"
					class={cn(
						buttonVariants({ variant: "default", size: "sm" }),
						"pointer-events-none",
					)}
				>
					{t("settings.notifications.fastConfig.selected")}
					<CheckIcon
						weight="bold"
						data-icon="inline-end"
						aria-hidden="true"
					/>
				</span>
			{:else}
				<Button
					variant={modifies ? "default" : "secondary"}
					size="sm"
					disabled={locked}
					aria-busy={loading}
					aria-describedby="{headingId} {descriptionId}"
					onclick={() => void chooseFastSource(source)}
				>
					{#if loading}
						<Spinner aria-hidden="true" />
					{/if}
					{modifies
						? t("settings.notifications.fastConfig.modify")
						: t("settings.notifications.fastConfig.setUp")}
					<CaretRightIcon data-icon="inline-end" aria-hidden="true" />
				</Button>
			{/if}
		</li>
	{/each}
</ul>
