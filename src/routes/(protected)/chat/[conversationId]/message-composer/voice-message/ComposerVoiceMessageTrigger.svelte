<script>
	import { MicrophoneIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import ToastUnimplemented from "$lib/components/feedback/ToastUnimplemented.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";
	import PrimaryComposerButton from "../PrimaryComposerButton.svelte";

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<PrimaryComposerButton
	onclick={() => {
		toast(ToastUnimplemented, {
			componentProps: {
				feature: "Voice messages",
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
