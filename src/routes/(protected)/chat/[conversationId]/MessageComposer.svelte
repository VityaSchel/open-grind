<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";
	import { MicrophoneIcon, PaperPlaneRightIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";
	import { expoOut } from "svelte/easing";
	import { fade } from "svelte/transition";

	import { showErrorToast } from "$lib/api/error";
	import ToastUnimplemented from "$lib/components/ToastUnimplemented.svelte";
	import { Button } from "$lib/components/ui/button";
	import { Textarea } from "$lib/components/ui/textarea";
	import type { Message } from "$lib/model/message";

	let {
		onSend,
		disabled,
	}: { onSend: (params: Message) => void | Promise<void>; disabled: boolean } =
		$props();

	let textContent = $state("");

	const isMobile = ["android", "ios"].includes(platform());

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
	class="relative mx-2 shrink-0 min-h-9.5 min-w-0"
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit().catch((error) => console.error(error));
	}}
>
	<Textarea
		placeholder="Say something..."
		class="min-h-9.5 rounded-[20px] shrink-0 max-h-31.5 py-2 pr-9.5 h-fit! leading-5 placeholder-shown:truncate"
		enterkeyhint={isMobile ? "enter" : "send"}
		onkeydown={(
			event: KeyboardEvent & {
				currentTarget: EventTarget & HTMLTextAreaElement;
			},
		) => {
			if (!isMobile && event.key === "Enter" && !event.shiftKey) {
				event.preventDefault();
				event.currentTarget.form?.requestSubmit();
			}
		}}
		bind:value={textContent}
		{disabled}
	/>
	{#if textContent === ""}
		<div class="button" transition:fade={{ duration: 400, easing: expoOut }}>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				class="size-full cursor-pointer p-2"
				onclick={() => {
					toast(ToastUnimplemented, {
						componentProps: {
							feature: "Voice messages",
							issue: 35,
						},
					});
				}}
				{disabled}
			>
				<MicrophoneIcon
					weight="fill"
					color="var(--muted-foreground)"
					class="size-4.5"
				/>
			</Button>
		</div>
	{:else}
		<div class="button" transition:fade={{ duration: 400, easing: expoOut }}>
			<Button
				type="submit"
				variant="ghost"
				size="icon"
				class="size-full cursor-pointer p-2"
				{disabled}
			>
				<PaperPlaneRightIcon
					weight="fill"
					color="var(--primary)"
					class="size-4.5"
				/>
			</Button>
		</div>
	{/if}
</form>

<style lang="postcss">
	@reference "$layout";
	.button {
		@apply size-9.5 absolute bottom-0 right-0;
	}
</style>
