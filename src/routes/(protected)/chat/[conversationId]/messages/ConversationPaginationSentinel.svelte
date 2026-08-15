<script lang="ts">
	import { tick } from "svelte";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import { getConversationState } from "../conversation-state.svelte";

	let { container }: { container: HTMLElement } = $props();

	const conversationState = $derived(getConversationState()());

	async function loadMore() {
		const state = conversationState;
		if (!container || state.loadingMore || state.pageKey === null) return;
		const switchedConversationMidFetch = () =>
			state.destroyed || conversationState !== state;
		const prevScrollHeight = container.scrollHeight;
		await state.loadMore();
		if (switchedConversationMidFetch()) return;
		await tick();
		if (switchedConversationMidFetch()) return;
		container.scrollTop += container.scrollHeight - prevScrollHeight;
	}
</script>

{#if conversationState.pageKey !== null}
	<div
		class="h-0"
		use:observeIntersection={{ handle: loadMore, rootMargin: "400px" }}
	></div>
{/if}
