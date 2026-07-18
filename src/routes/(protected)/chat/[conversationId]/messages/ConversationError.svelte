<script lang="ts">
	import { ApiError } from "$lib/api";
	import ApiErrorDisplay from "$lib/components/feedback/ApiErrorDisplay.svelte";
	import { getConversationState } from "../conversation-state.svelte";

	const conversationState = $derived(getConversationState()());
	const error = $derived(conversationState.error);
</script>

{#if error instanceof ApiError && error.response?.status === 403}
	<p class="m-auto text-center text-sm text-muted-foreground">
		Conversation is no longer available
	</p>
{:else}
	<ApiErrorDisplay
		{error}
		onRetry={() => conversationState.retry()}
		class="m-auto"
	/>
{/if}
