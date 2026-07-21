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
		// The scroll container is shared across [conversationId] changes. If the
		// user switched conversations mid-fetch, applying A's delta to B's height
		// would jump the scroll position. The captured `state` is destroyed on
		// switch (+page.svelte effect cleanup), so `state.destroyed` is reliable
		// even when this component has unmounted and its `conversationState`
		// derived has gone stale.
		if (state.destroyed || conversationState !== state) return;
		await tick();
		if (state.destroyed || conversationState !== state) return;
		container.scrollTop += container.scrollHeight - prevScrollHeight;
	}

	function observeSentinel(node: HTMLElement) {
		const observer = new IntersectionObserver(
			(entry) => {
				if (entry[0].isIntersecting) {
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
