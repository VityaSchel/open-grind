<script lang="ts">
	import { ChatCircleIcon } from "phosphor-svelte";

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

<Button size="icon-lg" class="size-14" href="/chat/{conversationId}">
	<ChatCircleIcon weight="fill" class="size-8" />
</Button>
