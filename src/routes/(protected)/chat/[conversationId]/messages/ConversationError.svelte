<script lang="ts">
	import { ConversationUnavailableError } from "$lib/api/messaging/messages";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { t } from "$lib/i18n";
	import { getConversationState } from "../conversation-state.svelte";

	const conversationState = $derived(getConversationState()());
	const error = $derived(conversationState.error);
</script>

{#if error instanceof ConversationUnavailableError}
	<p class="m-auto text-center text-sm text-muted-foreground">
		{t("chat.conversation.unavailable")}
	</p>
{:else}
	<ApiErrorDisplay
		{error}
		onRetry={() => conversationState.retry()}
		class="m-auto"
	/>
{/if}
