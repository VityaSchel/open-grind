<script lang="ts">
	import { untrack } from "svelte";

	import { setConversationState } from "../conversation-state.svelte";
	import ComposerAttachmentsMenu from "./attachments/ComposerAttachmentsMenu.svelte";
	import {
		type ComposerBinding,
		getComposerSheets,
	} from "./composer-sheets-state.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import ComposerStickersMenu from "./stickers/ComposerStickersMenu.svelte";

	let { conversationId }: { conversationId: string } = $props();

	const sheets = getComposerSheets();

	untrack(() => sheets.close({ conversationId }));

	function boundComposer(): ComposerBinding {
		const { composer } = sheets;
		if (composer === null)
			throw new Error(
				"No message composer is bound to the composer sheets",
			);
		return composer;
	}

	setConversationState(() => boundComposer().conversationState());
	setMessageComposerContext(() => boundComposer().context());
</script>

{#if sheets.composer}
	<ComposerAttachmentsMenu
		bind:open={
			() => sheets.isOpen({ conversationId, sheet: "attachments" }),
			(open) =>
				sheets.setOpen({ conversationId, sheet: "attachments", open })
		}
		onCloseAutoFocus={(event) =>
			sheets.returnFocusOnClose({ sheet: "attachments", event })}
	/>
	<ComposerStickersMenu
		bind:open={
			() => sheets.isOpen({ conversationId, sheet: "stickers" }),
			(open) =>
				sheets.setOpen({ conversationId, sheet: "stickers", open })
		}
		onCloseAutoFocus={(event) =>
			sheets.returnFocusOnClose({ sheet: "stickers", event })}
	/>
{/if}
