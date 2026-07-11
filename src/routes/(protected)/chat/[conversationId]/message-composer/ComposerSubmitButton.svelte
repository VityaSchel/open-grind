<script>
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { isSoftKeyboardVisible } from "$lib/platform/android-native-bridge";
	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	type="submit"
	{disabled}
	onpointerdown={(event) => {
		if (isSoftKeyboardVisible() !== false) event.preventDefault();
	}}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
