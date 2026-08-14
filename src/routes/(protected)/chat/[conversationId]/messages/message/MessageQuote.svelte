<script lang="ts">
	import {
		previewFromMessage,
		quoteLabel,
	} from "$lib/model/messaging/message-preview";
	import type { QuotedMessage } from "$lib/model/messaging/messages";
	import { getMessageContext, getMessageMetaContext } from "./context";

	let { quoted }: { quoted: QuotedMessage } = $props();

	const { isOut } = $derived(getMessageContext()());
	const { clone } = $derived(getMessageMetaContext()());

	const label = $derived(quoteLabel(previewFromMessage(quoted)));
</script>

<div
	data-slot="message-quote"
	class={[
		"mb-1 flex max-w-100 items-end",
		{
			"flex-row-reverse": isOut,
			"ms-3": !isOut && !clone,
			"me-3": isOut && !clone,
		},
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
	<span
		class="mx-1 min-w-0 truncate rounded-xl bg-muted px-3 py-1.5 text-sm text-muted-foreground"
	>
		{label}
	</span>
</div>
