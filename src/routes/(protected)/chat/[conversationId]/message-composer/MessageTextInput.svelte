<script lang="ts">
	import { Textarea } from "$lib/components/ui/textarea";
	import { isMobilePlatform } from "$lib/platform/os";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	let {
		value = $bindable(),
		ref = $bindable(null),
		onEscape,
	}: {
		value: string;
		ref?: HTMLTextAreaElement | null;
		onEscape?: () => void;
	} = $props();

	const isMobile = isMobilePlatform();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<Textarea
	placeholder="Say something..."
	class="h-fit! max-h-31.5 min-h-9.5 shrink-0 rounded-composer py-2 pr-9 leading-5 placeholder-shown:truncate"
	enterkeyhint={isMobile ? "enter" : "send"}
	onkeydown={(
		event: KeyboardEvent & {
			currentTarget: EventTarget & HTMLTextAreaElement;
		},
	) => {
		if (event.key === "Escape") {
			event.preventDefault();
			onEscape?.();
			return;
		}
		if (!isMobile && event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			event.currentTarget.form?.requestSubmit();
		}
	}}
	bind:value
	bind:ref
	{disabled}
/>
