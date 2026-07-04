<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";

	import { Textarea } from "$lib/components/ui/textarea";
	import { demoEnabled } from "$lib/demo";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	let {
		value = $bindable(),
	}: {
		value: string;
	} = $props();

	const isMobile = !demoEnabled && ["android", "ios"].includes(platform());

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<Textarea
	placeholder="Say something..."
	class="h-fit! max-h-31.5 min-h-9.5 shrink-0 rounded-[20px] py-2 pr-9 leading-5 placeholder-shown:truncate"
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
	bind:value
	{disabled}
/>
