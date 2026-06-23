<script lang="ts">
	import { writeText } from "@tauri-apps/plugin-clipboard-manager";
	import {
		ArrowUUpLeftIcon,
		CopyIcon,
		FlagIcon,
		TrashIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";
	import type { ComponentProps } from "svelte";

	import fireEmoji from "$lib/assets/emojis/fire/32px.png";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import ToastUnimplemented from "$lib/components/ToastUnimplemented.svelte";
	import { Button } from "$lib/components/ui/button";

	let {
		textContent,
		reactionAvailable,
		onDelete,
		onUnsend,
		...props
	}: ComponentProps<typeof ContextMenu> & {
		textContent?: string;
		reactionAvailable?: boolean;
		onDelete?: () => void;
		onUnsend?: () => void;
	} = $props();
</script>

<ContextMenu {...props}>
	{#snippet children(placement)}
		{#if reactionAvailable}
			<span
				class={[
					"block w-45 mb-2 text-center text-foreground/50 text-shadow-sm",
					{
						"-mt-8": !placement.startsWith("bottom"),
						"mt-1": placement.startsWith("bottom"),
					},
				]}
			>
				Double tap to <img
					src={fireEmoji}
					alt="Fire Emoji"
					width="16"
					height="16"
					class="inline align-middle"
					draggable="false"
				/>
			</span>
		{/if}
		<div class="buttons w-45">
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

<style lang="postcss">
	@reference "$layout";

	.buttons {
		@apply bg-black/80 rounded-xl p-1 flex flex-col *:justify-start *:active:translate-y-0!;
	}
</style>
