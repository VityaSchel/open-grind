<script>
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import PrimaryComposerButton from "#lib/components/shared/PrimaryComposerButton.svelte";
	import { softKeyboardVisibility } from "#lib/platform/native-insets.ts";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

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
