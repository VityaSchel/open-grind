<script lang="ts">
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

	function observe(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					mounted = true;
					observer.disconnect();
				}
			},
			{ rootMargin: "600px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

{#if mounted}
	<Conversation
		{conversation}
		{selection}
		{onEnterSelection}
		{onRequestDelete}
	/>
{:else}
	<div class="h-24.5 w-full shrink-0 rounded-2xl bg-muted/30" use:observe></div>
{/if}
