<script lang="ts">
	import { CaretDownIcon } from "phosphor-svelte";

	import ScrollJumpButton from "$lib/components/shared/ScrollJumpButton.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { getConversationState } from "../conversation-state.svelte";

	let {
		onclick,
		seenMessageIds,
	}: { onclick: () => void; seenMessageIds: ReadonlySet<string> } = $props();

	const conversationState = $derived(getConversationState()());

	// Counts only unseen messages on the newer side of the newest seen one:
	// pagination appends older history that was never on screen, and history
	// must not read as new.
	const unreadCount = $derived.by(() => {
		const messages = conversationState.messages;
		const boundary = messages.findIndex((message) =>
			seenMessageIds.has(message.messageId),
		);
		if (boundary === -1) return 0;
		let count = 0;
		for (const message of messages.slice(0, boundary)) {
			if (message.senderId !== conversationState.ourProfileId) count++;
		}
		return count;
	});
</script>

<ScrollJumpButton
	label="Scroll to newest messages"
	class="absolute right-3 bottom-[calc(var(--composer-height)+--spacing(3))] z-2"
	{onclick}
>
	<CaretDownIcon />
	{#snippet badge()}
		{#if unreadCount > 0}
			<Badge
				class="pointer-events-none absolute -top-1.5 -right-1.5 min-w-5 px-count-badge"
			>
				{unreadCount}
			</Badge>
		{/if}
	{/snippet}
</ScrollJumpButton>
