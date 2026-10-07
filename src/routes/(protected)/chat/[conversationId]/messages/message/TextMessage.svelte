<script lang="ts">
	import type { TextMessage } from "$lib/model/messaging/messages";
	import MessageBubble from "./MessageBubble.svelte";

	let { message }: { message: TextMessage["body"] } = $props();
</script>

<MessageBubble tone="sent">
	<span class="wrap-anywhere whitespace-pre-wrap" translate="no"
		>{message.text}</span
	>
</MessageBubble>
