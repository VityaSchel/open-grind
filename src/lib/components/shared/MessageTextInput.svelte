<script lang="ts">
	import { Textarea } from "$lib/components/ui/textarea";
	import { isMobilePlatform } from "$lib/platform/os";

	let {
		value = $bindable(),
		ref = $bindable(null),
		onEscape,
		placeholder,
		padding,
		disabled,
		onkeydown,
		...props
	}: import("svelte").ComponentProps<typeof Textarea> & {
		padding: string;
		onEscape?: () => void;
	} = $props();

	const isMobile = isMobilePlatform();
</script>

<Textarea
	{...props}
	{placeholder}
	class={[
		"h-fit! max-h-33 min-h-11 shrink-0 rounded-composer py-2.75 leading-5 placeholder-shown:truncate",
		padding,
	]}
	enterkeyhint={isMobile ? "enter" : "send"}
	onkeydown={(
		event: KeyboardEvent & {
			currentTarget: EventTarget & HTMLTextAreaElement;
		},
	) => {
		onkeydown?.(event);
		if (event.key === "Escape" && onEscape) {
			event.preventDefault();
			onEscape();
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
