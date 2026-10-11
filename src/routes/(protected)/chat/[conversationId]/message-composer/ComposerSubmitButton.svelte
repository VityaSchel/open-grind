<script>
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { t } from "$lib/i18n";
	import { softKeyboardVisibility } from "$lib/platform/android-native-bridge";
	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	type="submit"
	aria-label={t("chat.composer.a11y.send")}
	{disabled}
	onpointerdown={(event) => {
		if (softKeyboardVisibility() !== false) event.preventDefault();
	}}
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
