<script lang="ts">
	import { showErrorToast } from "$lib/api/error";
	import type { Message } from "$lib/model/messaging/messages";
	import ComposerAttachments from "./attachments/ComposerAttachments.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";

	let {
		onSend,
		disabled,
	}: { onSend: (params: Message) => void | Promise<void>; disabled: boolean } =
		$props();

	let textContent = $state("");

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend({ type: "Text", body: { text } });
			textContent = "";
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to send message",
				error,
			});
		}
	}

	setMessageComposerContext(() => ({
		disabled,
		sendMessage: onSend,
	}));
</script>

<form
	class="absolute bottom-0 z-20 min-h-9.5 w-full min-w-0 shrink-0 px-2 pb-2"
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	<div class="relative h-full w-full rounded-composer bg-popover">
		<MessageTextInput bind:value={textContent} />
		{#if textContent === ""}
			<ComposerAttachments />
			<ComposerVoiceMessage />
		{:else}
			<ComposerSubmitButton />
		{/if}
	</div>
</form>
