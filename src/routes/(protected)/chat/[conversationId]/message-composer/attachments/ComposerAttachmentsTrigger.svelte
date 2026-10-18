<script lang="ts">
	import PaperclipIcon from "phosphor-svelte/lib/PaperclipIcon";
	import { expoOut } from "svelte/easing";

	import { scale } from "$lib/util/reduced-motion";
	import ComposerButton from "../ComposerButton.svelte";
	import { getMessageComposerContext } from "../message-composer-context.svelte";

	let {
		onClick,
		ref = $bindable(null),
	}: { onClick?: () => void; ref?: HTMLElement | null } = $props();

	const { disabled } = $derived(getMessageComposerContext()());
</script>

<div
	data-slot="composer-attachments-trigger"
	class={["absolute right-8.5 bottom-0", { "pointer-events-none": disabled }]}
	transition:scale={{ duration: 400, easing: expoOut, start: 0 }}
>
	<ComposerButton
		bind:ref
		class="static pe-1.5"
		aria-label="Add attachment"
		onclick={() => {
			onClick?.();
		}}
		{disabled}
	>
		{#snippet icon({ ...props })}
			<PaperclipIcon {...props} class="size-5.5" />
		{/snippet}
	</ComposerButton>
</div>
