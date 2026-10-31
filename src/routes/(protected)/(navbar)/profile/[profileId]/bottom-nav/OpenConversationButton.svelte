<script lang="ts">
	import { conversationIdFor } from "$lib/chat/conversation-id";
	import Button from "$lib/components/ui/button/button.svelte";

	let {
		profileId,
		ourProfileId,
	}: { profileId: number; ourProfileId: number } = $props();

	const conversationId = $derived(
		conversationIdFor({ profileId, ourProfileId }),
	);
</script>

<Button
	variant="outline"
	size="lg"
	class="flex-1 justify-start bg-input/20!"
	href="/chat/{conversationId}"
>
	<span class="font-normal text-muted-foreground">Write a message...</span>
</Button>
