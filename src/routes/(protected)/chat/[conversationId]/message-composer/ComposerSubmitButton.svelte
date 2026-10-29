<script>
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import { softKeyboardVisibility } from "$lib/platform/native-insets";
	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());

	function keepKeyboardUp(event) {
		if (softKeyboardVisibility() !== false) event.preventDefault();
	}
</script>

<PrimaryComposerButton
	type="submit"
	aria-label="Send message"
	{disabled}
	onpointerdown={keepKeyboardUp}
	onmousedown={keepKeyboardUp}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
