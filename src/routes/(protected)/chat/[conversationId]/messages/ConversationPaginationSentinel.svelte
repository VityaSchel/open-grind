<script lang="ts">
	import { tick } from "svelte";

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

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entry) => {
				if (entry[0]?.isIntersecting) {
					loadMore().catch((error) => console.error(error));
				}
			},
			{ rootMargin: "400px" },
		);
		observer.observe(node);
		return {
			destroy() {
				observer.disconnect();
			},
		};
	}
</script>

{#if conversationState.pageKey !== null}
	<div class="h-0" use:observeSentinel></div>
{/if}
