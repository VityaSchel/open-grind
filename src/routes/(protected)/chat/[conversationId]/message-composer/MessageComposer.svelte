<script lang="ts">
	import {
		MicrophoneIcon,
		PaperclipIcon,
		PaperPlaneRightIcon,
	} from "phosphor-svelte";
	import { toast } from "svelte-sonner";
	import { expoOut } from "svelte/easing";
	import { scale } from "svelte/transition";

	import { showErrorToast } from "$lib/api/error";
	import ToastUnimplemented from "$lib/components/ToastUnimplemented.svelte";
	import type { Message } from "$lib/model/message";
	import ComposerButton from "./ComposerButton.svelte";
	import MessageTextInput from "./MessageTextInput.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

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
		<div class="absolute right-7 bottom-0" transition:scale={{ duration: 600, easing: expoOut, start: 0 }}>
			<ComposerButton class="right-7 pe-1.5 static" onclick={() => {}} {disabled}>
				{#snippet icon({ ...props })}
					<PaperclipIcon {...props} />
				{/snippet}
			</ComposerButton>
		</div>
		<PrimaryComposerButton
			onclick={() => {
				toast(ToastUnimplemented, {
					componentProps: {
						feature: "Voice messages",
						issue: 35,
					},
				});
			}}
			{disabled}
			class="ps-0"
		>
			{#snippet icon({ ...props })}
				<MicrophoneIcon weight="fill" {...props} />
			{/snippet}
		</PrimaryComposerButton>
	{:else}
		<PrimaryComposerButton type="submit" {disabled}>
			{#snippet icon({ ...props })}
				<PaperPlaneRightIcon weight="fill" {...props} />
			{/snippet}
		</PrimaryComposerButton>
	{/if}
</form>
