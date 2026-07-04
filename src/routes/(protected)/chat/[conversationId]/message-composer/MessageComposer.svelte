<script lang="ts">
	import { showErrorToast } from "$lib/api/error";
	import type { Message } from "$lib/model/message";
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
	class="relative mx-2 min-h-9.5 min-w-0 shrink-0"
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	<MessageTextInput bind:value={textContent} />
	{#if textContent === ""}
		<ComposerAttachments />
		<ComposerVoiceMessage />
	{:else}
		<ComposerSubmitButton />
	{/if}
</form>
