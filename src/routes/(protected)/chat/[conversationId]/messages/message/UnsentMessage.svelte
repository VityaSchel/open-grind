<script lang="ts">
	import { t } from "#lib/i18n/index.ts";
	import MessageBubble from "./MessageBubble.svelte";
</script>

<MessageBubble tone="unsent">
	<span class="whitespace-pre-wrap">{t("chat.message.unsent")}</span>
</MessageBubble>
