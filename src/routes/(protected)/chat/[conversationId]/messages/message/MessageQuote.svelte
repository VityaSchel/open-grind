<script lang="ts">
	import type { Snippet } from "svelte";

	import {
		previewFromMessage,
		quoteLabel,
	} from "$lib/model/messaging/message-preview";
	import type { QuotedMessage } from "$lib/model/messaging/messages";
	import { getMessageContext, getMessageMetaContext } from "./context";

	let { quoted, children }: { quoted?: QuotedMessage; children?: Snippet } =
		$props();

	const { isOut } = $derived(getMessageContext()());

	const { clone } = $derived(getMessageMetaContext()());

	const label = $derived(
		quoted ? quoteLabel(previewFromMessage(quoted)) : null,
	);
</script>

<div
	data-slot="message-quote"
	class={[
		"mb-1 flex w-fit max-w-100 items-end",
		{ "flex-row-reverse": isOut },
	]}
>
	<div
		class={[
			"h-4 w-5 flex-none border-t-2 border-muted-foreground/50",
			{
				"rounded-ss-quote-connector border-s-2": !isOut,
				"rounded-se-quote-connector border-e-2": isOut,
			},
		]}
	></div>
	<div
		inert={clone}
		class={[
			"mx-1 min-w-0 rounded-xl bg-muted text-sm text-muted-foreground",
			{ "p-2": !!children, "px-3 py-1.5": !children },
		]}
	>
		{#if label}<span class="line-clamp-1">{label}</span>{/if}
		{@render children?.()}
	</div>
</div>
