<script lang="ts">
	import { platform } from "@tauri-apps/plugin-os";

	import { Textarea } from "$lib/components/ui/textarea";

	let {
		value = $bindable(),
		disabled,
	}: {
		value: string;
		disabled?: boolean;
	} = $props();

	const isMobile = ["android", "ios"].includes(platform());
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
