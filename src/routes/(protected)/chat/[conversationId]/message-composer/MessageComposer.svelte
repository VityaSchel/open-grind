<script lang="ts">
	import { showErrorToast } from "$lib/api/error-toast";
	import type { Message } from "$lib/model/messaging/messages";
	import ComposerAttachments from "./attachments/ComposerAttachments.svelte";
	import ComposerSubmitButton from "./ComposerSubmitButton.svelte";
	import { setMessageComposerContext } from "./message-composer-context.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import ComposerVoiceMessage from "./voice-message/ComposerVoiceMessage.svelte";

	let {
		onSend,
		disabled,
		height = $bindable(0),
	}: {
		onSend: (params: Message) => void | Promise<void>;
		disabled: boolean;
		height?: number;
	} = $props();

	let textContent = $state("");
	let form: HTMLFormElement | null = $state(null);

	async function onSubmit() {
		const text = textContent.trim();
		if (text === "") return;
		try {
			await onSend({ type: "Text", body: { text } });
			textContent = "";
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Failed to send message", error });
		}
	}

	setMessageComposerContext(() => ({ disabled, sendMessage: onSend }));
</script>

<form
	bind:this={form}
	class="absolute bottom-0 z-20 min-h-9.5 w-full min-w-0 shrink-0 px-2 pb-2"
	bind:clientHeight={height}
	oninput={() => {
		// WebKit bug: resive observer emits event a frame late,
		// painting the taller composer over the newest message once
		if (form) height = form.clientHeight;
	}}
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
