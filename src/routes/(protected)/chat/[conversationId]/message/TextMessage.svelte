<script lang="ts">
	import type { TextMessage } from "$lib/model/message";
	import { getMessageContext, getMessageMetaContext } from "./context";
	import MessageTail from "./MessageTail.svelte";

	let { message }: { message: TextMessage["body"] } = $props();

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, setRef, adornments } = $derived(getMessageMetaContext()());

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		setRef(el ?? null);
	});
</script>

<div
	class={[
		"py-2 px-3 rounded-xl w-fit max-w-100 text-black shrink-0 relative overflow-visible select-text",
		{
			"pointer-coarse:select-none": !clone,
			"bg-message-bubble-in": !isOut,
			"ms-3": !isOut && !clone,
			"rounded-es-none": lastInStack && !isOut,
			"bg-message-bubble-out": isOut,
			"me-3": isOut && !clone,
			"rounded-ee-none": lastInStack && isOut,
		},
	]}
	bind:this={el}
>
	{#if lastInStack}
		<MessageTail
			{isOut}
			class={{
				"fill-message-bubble-in": !isOut,
				"fill-message-bubble-out": isOut,
			}}
		/>
	{/if}
	<span class="whitespace-pre-wrap">{message.text}</span>
	{@render adornments?.()}
</div>
