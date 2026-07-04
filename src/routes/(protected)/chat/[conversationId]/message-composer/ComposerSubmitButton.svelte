<script>
	import { PaperPlaneRightIcon } from "phosphor-svelte";

	import { getMessageComposerContext } from "./message-composer-context.svelte";
	import PrimaryComposerButton from "./PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton type="submit" {disabled}>
	{#snippet icon({ ...props })}
		<PaperPlaneRightIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
