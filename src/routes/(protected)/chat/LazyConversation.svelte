<script lang="ts">
	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { Conversation as ConversationType } from "$lib/model/messaging/conversations";
	import type { SelectionSet } from "$lib/util/selection.svelte";
	import Conversation from "./Conversation.svelte";

	let {
		conversation,
		selection = null,
		onEnterSelection,
		onRequestDelete,
	}: {
		conversation: ConversationType;
		selection?: SelectionSet<string> | null;
		onEnterSelection?: () => void;
		onRequestDelete?: () => void;
	} = $props();

	let mounted = $state(false);
</script>

{#if mounted}
	<Conversation
		{conversation}
		{selection}
		{onEnterSelection}
		{onRequestDelete}
	/>
{:else}
	<div
		class="h-24.5 w-full shrink-0 rounded-2xl bg-muted/30"
		use:observeIntersection={{
			handle: () => (mounted = true),
			rootMargin: "600px",
			once: true,
		}}
	></div>
{/if}
