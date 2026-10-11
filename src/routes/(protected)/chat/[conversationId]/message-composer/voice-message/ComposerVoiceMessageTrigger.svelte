<script>
	import { MicrophoneIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import { t } from "$lib/i18n";
	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	aria-label={t("chat.composer.voiceMessage.a11y.record")}
	onclick={() => {
		toast(ToastUnimplemented, {
			componentProps: {
				message: "chat.composer.voiceMessage.unimplemented",
				issue: 35,
			},
		});
	}}
	class="ps-0"
	{disabled}
>
	{#snippet icon({ ...props })}
		<MicrophoneIcon weight="fill" {...props} />
	{/snippet}
</PrimaryComposerButton>
