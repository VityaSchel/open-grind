<script lang="ts">
	import { onNavigate } from "$app/navigation";
	import { onDestroy, tick, untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";
	import { below } from "$lib/util/breakpoints.svelte";
	import { bottomChrome } from "$lib/util/screen-chrome.svelte";
	import type {
		ApiResponseMessage,
		MessageDraft,
	} from "$lib/model/messaging/messages";
	import { getConversationState } from "../conversation-state.svelte";
	import ComposerAttachmentsTrigger from "./attachments/ComposerAttachmentsTrigger.svelte";
	import {
		type ComposerSheet,
		getComposerSheets,
	} from "./composer-sheets-state.svelte";
	import ComposerReplyPreview from "./ComposerReplyPreview.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerSendMedia from "./send-media/ComposerSendMedia.svelte";
	import ComposerStickersTrigger from "./stickers/ComposerStickersTrigger.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";

	let {
		conversationId,
		onSend,
		disabled,
		replyTo,
		onCancelReply,
		height = $bindable(0),
	}: {
		conversationId: string;
		onSend: (drafts: MessageDraft[]) => void | Promise<void>;
		disabled: boolean;
		replyTo?: ApiResponseMessage | null;
		onCancelReply?: () => void;
		height?: number;
	} = $props();

	const { drafts } = getConversations();
	const sheets = getComposerSheets();
	const mobile = below("split");

	let textContent = $state(untrack(() => drafts.get(conversationId)));
	let form: HTMLFormElement | null = $state(null);
	let textInput: HTMLTextAreaElement | null = $state(null);
	let stickersTrigger: HTMLElement | null = $state(null);
	let attachmentsTrigger: HTMLElement | null = $state(null);

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend([draftFromMessage({ type: "Text", body: { text } })]);
			textContent = "";
			drafts.discard(conversationId);
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send message", error });
		}
	}

	function remeasureBeforeResizeObserverCatchesUp() {
		if (form) height = form.clientHeight;
	}

	$effect(() => {
		const openedConversationId = conversationId;
		untrack(() => {
			const stored = drafts.open(openedConversationId);
			if (textContent === stored) return;
			textContent = stored;
			void tick().then(remeasureBeforeResizeObserverCatchesUp);
		});
		return () =>
			drafts.save({
				conversationId: openedConversationId,
				text: textContent,
			});
	});

	$effect(() => {
		drafts.autosave({ conversationId, text: textContent });
	});

	onNavigate(({ to }) => {
		if (to?.params?.conversationId !== conversationId)
			drafts.save({ conversationId, text: textContent });
	});

	// Arming a reply should hand the user straight back to the composer, which
	// on touch is also what raises the keyboard.
	$effect(() => {
		if (!replyTo || !textInput) return;
		if (untrack(() => sheets.hasOpenSheet({ conversationId }))) return;
		textInput.focus();
	});

	dismissOnBackGesture({
		active: () => replyTo !== null && replyTo !== undefined,
		dismiss: () => onCancelReply?.(),
		layer: "screen",
	});

	function focusTrigger({ sheet }: { sheet: ComposerSheet }) {
		const trigger =
			sheet === "attachments" && attachmentsTrigger?.isConnected
				? attachmentsTrigger
				: stickersTrigger;
		trigger?.focus();
	}

	const composerContext = () => ({
		conversationId,
		disabled,
		sendMessages: onSend,
	});
	setMessageComposerContext(composerContext);
	onDestroy(
		sheets.bind({
			conversationState: getConversationState(),
			context: composerContext,
			focusTrigger,
		}),
	);
</script>

<form
	bind:this={form}
	data-slot="message-composer"
	class="absolute bottom-0 z-20 flex min-h-11 w-full min-w-0 shrink-0 flex-col gap-1 px-2 pb-2"
	bind:clientHeight={height}
	{@attach mobile.current && bottomChrome}
	oninput={remeasureBeforeResizeObserverCatchesUp}
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	{#if replyTo}
		<ComposerReplyPreview message={replyTo} onCancel={onCancelReply} />
	{/if}
	<div class="relative h-full w-full rounded-composer bg-popover">
		<ComposerStickersTrigger
			bind:ref={stickersTrigger}
			onClick={() =>
				sheets.setOpen({
					conversationId,
					sheet: "stickers",
					open: true,
				})}
		/>
		<MessageTextInput
			bind:value={textContent}
			bind:ref={textInput}
			onEscape={onCancelReply}
		/>
		{#if textContent === ""}
			<ComposerAttachmentsTrigger
				bind:ref={attachmentsTrigger}
				onClick={() =>
					sheets.setOpen({
						conversationId,
						sheet: "attachments",
						open: true,
					})}
			/>
			<ComposerVoiceMessage />
		{:else}
			<ComposerSubmitButton />
		{/if}
	</div>
	{#key conversationId}
		<ComposerSendMedia />
	{/key}
</form>
