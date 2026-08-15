<script lang="ts">
	import { tick, untrack } from "svelte";

	import { showErrorToast } from "$lib/api/error-toast";
	import { getConversations } from "$lib/chat/conversations-context.svelte";
	import { draftFromMessage } from "$lib/model/messaging/messages";
	import type { MessageDraft } from "$lib/model/messaging/messages";
	import ComposerAttachments from "./attachments/ComposerAttachments.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";

	let {
		conversationId,
		onSend,
		disabled,
		height = $bindable(0),
	}: {
		conversationId: string;
		onSend: (draft: MessageDraft) => void | Promise<void>;
		disabled: boolean;
		height?: number;
	} = $props();

	const { drafts } = getConversations();

	let textContent = $state(untrack(() => drafts.get(conversationId)));
	let form: HTMLFormElement | null = $state(null);

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend(draftFromMessage({ type: "Text", body: { text } }));
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

	setMessageComposerContext(() => ({ disabled, sendMessage: onSend }));
</script>

<form
	bind:this={form}
	class="absolute bottom-0 z-20 min-h-9.5 w-full min-w-0 shrink-0 px-2 pb-2"
	bind:clientHeight={height}
	oninput={remeasureBeforeResizeObserverCatchesUp}
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	<div class="relative h-full w-full rounded-composer bg-popover">
		<MessageTextInput bind:value={textContent} />
		{#if textContent === ""}
			{#key conversationId}
				<ComposerAttachments />
			{/key}
			<ComposerVoiceMessage />
		{:else}
			<ComposerSubmitButton />
		{/if}
	</div>
</form>
