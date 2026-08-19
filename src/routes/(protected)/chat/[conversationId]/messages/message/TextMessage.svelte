<script lang="ts">
	import type { TextMessage } from "$lib/model/messaging/messages";
	import MessageBubble from "./MessageBubble.svelte";

	let { message }: { message: TextMessage["body"] } = $props();
</script>

<MessageBubble tone="sent">
	<span class="wrap-anywhere whitespace-pre-wrap">{message.text}</span>
</MessageBubble>
