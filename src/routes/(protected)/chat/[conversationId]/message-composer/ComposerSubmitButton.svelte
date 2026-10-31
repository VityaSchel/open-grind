<script>
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import PrimaryComposerButton from "$lib/components/shared/PrimaryComposerButton.svelte";
	import { softKeyboardVisibility } from "$lib/platform/android-native-bridge";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	type="submit"
	aria-label="Send message"
	{disabled}
	onpointerdown={(event) => {
		if (softKeyboardVisibility() !== false) event.preventDefault();
	}}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
