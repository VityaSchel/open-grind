<script lang="ts">
	import type { Snippet } from "svelte";

	import {
		getMessageContext,
		getMessageMetaContext,
		messageRef,
	} from "./context";
	import MessageTail from "./MessageTail.svelte";

	let { tone, children }: { tone: "sent" | "unsent"; children: Snippet } =
		$props();

	const { lastInStack, isOut } = $derived(getMessageContext()());
	const { clone, adornments } = $derived(getMessageMetaContext()());

	const ref = messageRef();

	const sent = $derived(tone === "sent");
</script>

<div
	class={[
		"relative w-fit max-w-100 shrink-0 overflow-visible rounded-xl px-3 py-2 select-text",
		{
			"pointer-coarse:select-none": !clone,
			"ms-3": !isOut && !clone,
			"me-3": isOut && !clone,
			"rounded-es-none": lastInStack && !isOut,
			"rounded-ee-none": lastInStack && isOut,
			"text-black": sent,
			"bg-message-bubble-in": sent && !isOut,
			"bg-message-bubble-out": sent && isOut,
			"bg-muted text-muted-foreground italic": !sent,
		},
	]}
	{@attach ref}
>
	{#if lastInStack}
		<MessageTail
			{isOut}
			class={{
				"fill-message-bubble-in": sent && !isOut,
				"fill-message-bubble-out": sent && isOut,
				"fill-muted": !sent,
			}}
		/>
	{/if}
	{@render children()}
	{@render adornments?.()}
</div>
