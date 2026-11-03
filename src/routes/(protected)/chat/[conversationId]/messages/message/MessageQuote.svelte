<script lang="ts">
	import type { Snippet } from "svelte";

	import {
		previewFromMessage,
		quoteIsUserText,
		quoteLabel,
	} from "#lib/model/messaging/message-preview.ts";
	import type { QuotedMessage } from "#lib/model/messaging/messages.ts";
	import { getMessageContext, getMessageMetaContext } from "./context";

	let { quoted, children }: { quoted?: QuotedMessage; children?: Snippet } =
		$props();

	const { isOut } = $derived(getMessageContext()());

	const { clone } = $derived(getMessageMetaContext()());

	const preview = $derived(quoted ? previewFromMessage(quoted) : null);
	const label = $derived(preview ? quoteLabel(preview) : null);
	const userText = $derived(preview ? quoteIsUserText(preview) : false);
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
		{#if label}<span
				class="line-clamp-1"
				translate={userText ? "no" : undefined}>{label}</span
			>{/if}
		{@render children?.()}
	</div>
</div>
