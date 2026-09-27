<script lang="ts">
	import { flushSync } from "svelte";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import { getConversationState } from "../conversation-state.svelte";

	let { container }: { container: HTMLElement } = $props();

	const conversationState = $derived(getConversationState()());

	async function loadMore() {
		const state = conversationState;
		if (!container || state.loadingMore || state.pageKey === null) return;
		await state.loadMore({
			commit: (apply) => {
				if (conversationState === state && container)
					keepReadingPosition({ scroller: container, apply });
				else apply();
			},
		});
	}

	function keepReadingPosition({
		scroller,
		apply,
	}: {
		scroller: HTMLElement;
		apply: () => void;
	}): void {
		const anchor = firstMessageInView(scroller);
		const anchorTop = anchor?.getBoundingClientRect().top;
		apply();
		flushSync();
		if (!anchor?.isConnected || anchorTop === undefined) return;
		const shift = anchor.getBoundingClientRect().top - anchorTop;
		if (shift !== 0) scroller.scrollBy({ top: shift, behavior: "instant" });
	}

	function firstMessageInView(
		scroller: HTMLElement,
	): HTMLElement | undefined {
		const viewTop = scroller.getBoundingClientRect().top;
		return Array.from(
			scroller.querySelectorAll<HTMLElement>('[data-slot="message"]'),
		).find((message) => message.getBoundingClientRect().bottom > viewTop);
	}
</script>

{#key conversationState.pageKey}
	<div
		class="h-0"
		use:observeIntersection={{
			handle: conversationState.pageKey === null ? undefined : loadMore,
			rootMargin: "400px",
		}}
	></div>
{/key}
