<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import {
		ArrowBendUpLeftIcon,
		ArrowUUpLeftIcon,
		CopyIcon,
		FlagIcon,
		TrashIcon,
		WarningCircleIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";
	import type { ComponentProps } from "svelte";

	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import ContextMenuPanel from "$lib/components/shared/ContextMenuPanel.svelte";
	import { Button } from "$lib/components/ui/button";

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
				Double tap to <img
					src={fireEmoji}
					alt="react with fire"
					width="16"
					height="16"
					class="inline align-middle"
					draggable="false"
				/>
			</span>
			<Button
				variant="ghost"
				size="icon-lg"
				aria-label="React with fire"
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
				<ArrowBendUpLeftIcon /> Reply
			</Button>
		{/if}
		{#if textContent !== undefined}
			<Button
				variant="ghost"
				onclick={() => {
					writeText(textContent)
						.then(() => {
							toast.success("Message copied to clipboard");
							props.onClose();
						})
						.catch((error) => console.error(error));
				}}
			>
				<CopyIcon /> Copy message
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
				<WarningCircleIcon /> Copy error
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
				Delete for me
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
				Unsend message
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
				<FlagIcon /> Report
			</Button>
		{/if}
	</ContextMenuPanel>
</ContextMenu>
