<script lang="ts">
	import {
		ArrowBendUpLeftIcon,
		ArrowUUpLeftIcon,
		CopyIcon,
		FlagIcon,
		TrashIcon,
		WarningCircleIcon,
	} from "phosphor-svelte";
	import type { ComponentProps } from "svelte";

	import { copyToClipboard } from "$lib/api/error-copy";
	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import ContextMenuPanel from "$lib/components/shared/ContextMenuPanel.svelte";
	import { Button } from "$lib/components/ui/button";
	import { t } from "$lib/i18n";
	import Rich from "$lib/i18n/Rich.svelte";

	let {
		textContent,
		reactionAvailable,
		onDelete,
		onUnsend,
		onCopyError,
		onReply,
		onReport,
		onReact,
		...props
	}: ComponentProps<typeof ContextMenu> & {
		textContent?: string;
		reactionAvailable?: boolean;
		onDelete?: () => void;
		onUnsend?: () => void;
		onCopyError?: () => void;
		onReply?: () => void;
		onReport?: () => void;
		onReact?: (reactionId: number) => void;
	} = $props();
</script>

<ContextMenu {...props}>
	{#snippet header()}
		{#if reactionAvailable}
			<span
				class="mt-1 mb-2 block w-45 text-center text-foreground/50 text-shadow-sm can-hover:hidden"
			>
				<Rich key="chat.message.contextMenu.doubleTapToReact">
					{#snippet fireIcon(text)}<img
							src={fireEmoji}
							alt={text}
							width="16"
							height="16"
							class="inline align-middle"
							draggable="false"
						/>{/snippet}
				</Rich>
			</span>
			<Button
				variant="ghost"
				size="icon-lg"
				aria-label={t("chat.message.contextMenu.a11y.reactWithFire")}
				class="mt-1 mb-2 hidden self-start rounded-full bg-black/80 can-hover:inline-flex"
				onclick={() => {
					onReact?.(1);
					props.onClose();
				}}
			>
				<img
					src={fireEmoji}
					alt=""
					width="20"
					height="20"
					draggable="false"
				/>
			</Button>
		{/if}
	{/snippet}
	<ContextMenuPanel>
		{#if onReply}
			<Button
				variant="ghost"
				onclick={() => {
					onReply();
					props.onClose();
				}}
			>
				<ArrowBendUpLeftIcon />
				{t("chat.message.contextMenu.reply")}
			</Button>
		{/if}
		{#if textContent !== undefined}
			<Button
				variant="ghost"
				onclick={() => {
					void copyToClipboard({
						text: textContent,
						copiedMessage: t("chat.message.contextMenu.copied"),
					}).then(() => props.onClose());
				}}
			>
				<CopyIcon />
				{t("chat.message.contextMenu.copy")}
			</Button>
		{/if}
		{#if onCopyError}
			<Button
				variant="ghost"
				onclick={() => {
					onCopyError();
					props.onClose();
				}}
			>
				<WarningCircleIcon />
				{t("common.actions.copyError")}
			</Button>
		{/if}
		{#if onDelete}
			<Button
				variant="ghost"
				onclick={() => {
					onDelete();
					props.onClose();
				}}
			>
				<TrashIcon />
				{t("chat.message.contextMenu.deleteForMe")}
			</Button>
		{/if}
		{#if onUnsend}
			<Button
				variant="ghost"
				onclick={() => {
					onUnsend();
					props.onClose();
				}}
			>
				<ArrowUUpLeftIcon />
				{t("chat.message.contextMenu.unsend")}
			</Button>
		{/if}
		{#if onReport}
			<Button
				variant="ghost"
				onclick={() => {
					props.onClose();
					onReport();
				}}
			>
				<FlagIcon />
				{t("chat.message.contextMenu.report")}
			</Button>
		{/if}
	</ContextMenuPanel>
</ContextMenu>
