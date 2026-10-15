<script lang="ts">
	import BellIcon from "phosphor-svelte/lib/BellIcon";
	import BellSimpleSlashIcon from "phosphor-svelte/lib/BellSimpleSlashIcon";
	import DotsThreeVerticalIcon from "phosphor-svelte/lib/DotsThreeVerticalIcon";
	import PushPinIcon from "phosphor-svelte/lib/PushPinIcon";
	import PushPinSlashIcon from "phosphor-svelte/lib/PushPinSlashIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import XIcon from "phosphor-svelte/lib/XIcon";

	import ProgressiveBlur from "$lib/components/shared/ProgressiveBlur.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { t } from "$lib/i18n";
	import { below } from "$lib/util/breakpoints.svelte";
	import { topChrome } from "$lib/util/screen-chrome.svelte";

	let {
		count,
		allPinned,
		allMuted,
		onPin,
		onMute,
		onDelete,
		onClose,
	}: {
		count: number;
		allPinned: boolean;
		allMuted: boolean;
		onPin: () => void;
		onMute: () => void;
		onDelete: () => void;
		onClose: () => void;
	} = $props();

	const collapsed = below("selection-bar-collapse");

	const actions = $derived([
		{
			key: "pin" as const,
			label: allPinned
				? t("chat.conversations.selectionBar.actions.unpin")
				: t("chat.conversations.selectionBar.actions.pin"),
			icon: allPinned ? PushPinSlashIcon : PushPinIcon,
			weight: "fill" as const,
			destructive: false,
			onSelect: onPin,
		},
		{
			key: "mute" as const,
			label: allMuted
				? t("chat.conversations.selectionBar.actions.unmute")
				: t("chat.conversations.selectionBar.actions.mute"),
			icon: allMuted ? BellIcon : BellSimpleSlashIcon,
			weight: "fill" as const,
			destructive: false,
			onSelect: onMute,
		},
		{
			key: "delete" as const,
			label: t("chat.conversations.selectionBar.actions.delete"),
			icon: TrashIcon,
			weight: undefined,
			destructive: true,
			onSelect: onDelete,
		},
	]);
</script>

<ProgressiveBlur
	direction="topToBottom"
	class="fixed top-0 left-0 z-20 h-[calc(var(--selection-bar-height)+var(--safe-area-top))] w-full"
	bgClass="bg-linear-to-b from-background to-transparent"
	contentClass="flex h-full items-center gap-1.5 px-3 pt-(--safe-area-top) max-selection-bar-compact:gap-1 max-selection-bar-compact:px-2"
	tag="nav"
	aria-label={t("chat.conversations.selectionBar.a11y.navigation")}
	{@attach topChrome}
>
	<Button
		size="icon-lg"
		variant="ghost"
		class="max-selection-bar-compact:size-9"
		aria-label={t("chat.conversations.selectionBar.a11y.exit")}
		onclick={onClose}
	>
		<XIcon class="size-6 max-selection-bar-compact:size-5" />
	</Button>
	<span class="flex-1 truncate text-lg font-medium">
		{t("chat.conversations.selectionBar.selected", { count })}
	</span>
	{#if collapsed.current}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props: { class: className, ...props } })}
					<Button
						size="icon-lg"
						variant="secondary"
						class={[
							className,
							"size-12 max-selection-bar-compact:size-10",
						]}
						aria-label={t(
							"chat.conversations.selectionBar.a11y.actions",
						)}
						{...props}
					>
						<DotsThreeVerticalIcon
							class="size-6 max-selection-bar-compact:size-5"
						/>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				{#each actions as action (action.key)}
					{@const Icon = action.icon}
					<DropdownMenu.Item
						variant={action.destructive ? "destructive" : "default"}
						onSelect={action.onSelect}
					>
						<Icon weight={action.weight} class="size-5" />
						{action.label}
					</DropdownMenu.Item>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		{#each actions as action (action.key)}
			{@const Icon = action.icon}
			<Button
				size="icon-lg"
				variant="secondary"
				class={[
					"size-12 max-selection-bar-compact:size-10",
					{ "text-destructive": action.destructive },
				]}
				aria-label={action.label}
				onclick={action.onSelect}
			>
				<Icon
					weight={action.weight}
					class="size-6 max-selection-bar-compact:size-5"
				/>
			</Button>
		{/each}
	{/if}
</ProgressiveBlur>
