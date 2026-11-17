<script lang="ts">
	import PaperPlaneRightIcon from "phosphor-svelte/lib/PaperPlaneRightIcon";

	import PrimaryComposerButton from "#lib/components/shared/PrimaryComposerButton.svelte";
	import { t } from "#lib/i18n/index.ts";
	import { getMessageComposerContext } from "./message-composer-context.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	type="submit"
	aria-label={t("chat.composer.a11y.send")}
	{disabled}
	keepsSoftKeyboardUp
>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
