<script lang="ts">
	import { tick } from "svelte";

	import { getConversationState } from "../conversation-state.svelte";

	let {
		container,
	}: {
		container: HTMLElement;
	} = $props();

	const conversationState = $derived(getConversationState()());

	async function loadMore() {
		const state = conversationState;
		if (!container || state.loadingMore || state.pageKey === null) return;
		const prevScrollHeight = container.scrollHeight;
		await state.loadMore();
		// The scroll container is shared between conversations. If we switched
		// mid-fetch the old state is destroyed, so skip its scroll adjust.
		if (state.destroyed || conversationState !== state) return;
		await tick();
		if (state.destroyed || conversationState !== state) return;
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
