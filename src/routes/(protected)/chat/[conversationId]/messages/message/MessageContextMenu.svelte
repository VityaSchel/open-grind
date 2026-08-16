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
	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import ContextMenu from "$lib/components/shared/ContextMenu.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		textContent,
		reactionAvailable,
		onDelete,
		onUnsend,
		onCopyError,
		onReply,
		onReact,
		...props
	}: ComponentProps<typeof ContextMenu> & {
		textContent?: string;
		reactionAvailable?: boolean;
		onDelete?: () => void;
		onUnsend?: () => void;
		onCopyError?: () => void;
		onReply?: () => void;
		onReact?: (reactionId: number) => void;
	} = $props();
</script>

<ContextMenu {...props}>
	{#snippet children(placement)}
		{#if reactionAvailable}
			<!-- a cursor cannot double-tap, so it gets the reaction itself
			     where a touchscreen gets the hint -->
			<span
				class={[
					"mb-2 block w-45 text-center text-foreground/50 text-shadow-sm can-hover:hidden",
					{
						"-mt-8": !placement.startsWith("bottom"),
						"mt-1": placement.startsWith("bottom"),
					},
				]}
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
				class={[
					"mb-2 hidden self-start rounded-full bg-black/80 can-hover:inline-flex",
					{
						"-mt-8": !placement.startsWith("bottom"),
						"mt-1": placement.startsWith("bottom"),
					},
				]}
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
		<div
			class="flex w-45 flex-col rounded-xl bg-black/80 p-1 *:justify-start *:active:translate-y-0!"
		>
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
			<Button
				variant="ghost"
				onclick={() => {
					onDelete?.();
					props.onClose();
				}}
			>
				<TrashIcon />
				Delete for me
			</Button>
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
			<Button
				variant="ghost"
				onclick={() => {
					toast(ToastUnimplemented, {
						componentProps: {
							feature: "Report message",
							issue: 41,
						},
					});
					props.onClose();
				}}
			>
				<FlagIcon /> Report
			</Button>
		</div>
	{/snippet}
</ContextMenu>
