<script lang="ts">
	import type { Snippet } from "svelte";
	import type { Attachment } from "svelte/attachments";

	import type { QuotedMessage } from "$lib/model/messaging/messages";
	import {
		getMessageContext,
		type MessageRefs,
		setMessageMetaContext,
	} from "./context";
	import MessageQuote from "./MessageQuote.svelte";

	let {
		clone = false,
		quoted,
		setRefs,
		adornments,
		children,
	}: {
		clone?: boolean;
		quoted?: QuotedMessage | null;
		setRefs: (refs: MessageRefs) => void;
		adornments?: Snippet;
		children: Snippet;
	} = $props();

	const { isOut } = $derived(getMessageContext()());

	let frame: HTMLElement | null = $state(null);
	let content: HTMLElement | null = $state(null);

	const attachFrame: Attachment<HTMLElement> = (node) => {
		frame = node;
	};

	setMessageMetaContext(() => ({
		clone,
		setRef: (el: HTMLElement | null) => {
			if (!clone) content = el;
		},
		adornments: clone ? undefined : adornments,
	}));

	$effect(() => {
		if (clone) return;
		setRefs({ frame, content });
	});
</script>

<div
	{@attach attachFrame}
	class={["flex w-full flex-col", { "items-end": isOut }]}
>
	{#if quoted}
		<MessageQuote {quoted} />
	{/if}
	{@render children()}
</div>
