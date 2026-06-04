<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";

	let {
		profileId,
		ourProfileId,
	}: {
		profileId: number;
		ourProfileId: number;
	} = $props();

	const conversationId = $derived(
		[profileId, ourProfileId].toSorted((a, b) => a - b).join(":"),
	);
</script>

<Button
	variant="outline"
	size="lg"
	class="flex-1 justify-start bg-input/20!"
	href="/chat/{conversationId}"
>
	<span class="text-muted-foreground font-normal">Write a message...</span>
</Button>
