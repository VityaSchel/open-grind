<script lang="ts">
	import { untrack } from "svelte";

	import { observeIntersection } from "$lib/util/observe-intersection";
	import type { Conversation as ConversationType } from "$lib/model/messaging/conversations";
	import type { SelectionSet } from "$lib/util/selection.svelte";
	import Conversation from "./Conversation.svelte";
	import type { MountQueue, MountTicket } from "./mount-queue";

	let {
		conversation,
		eager,
		queue,
		selection = null,
		onEnterSelection,
		onRequestDelete,
	}: {
		conversation: ConversationType;
		eager: boolean;
		queue: MountQueue;
		selection?: SelectionSet<string> | null;
		onEnterSelection?: () => void;
		onRequestDelete?: () => void;
	} = $props();

	let mounted = $state(untrack(() => eager));
	let ticket: MountTicket | null = null;

	function enqueue(node: HTMLElement) {
		const queued = queue.add({ node, mount: () => (mounted = true) });
		ticket = queued;
		return () => queued.cancel();
	}

	function promoteInView(node: HTMLElement) {
		return observeIntersection(node, {
			handle: () => ticket?.promote({ inView: true }),
			once: true,
		}).destroy;
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
	<div
		class="h-24.5 w-full shrink-0 rounded-2xl bg-muted/30"
		{@attach enqueue}
		{@attach promoteInView}
		use:observeIntersection={{
			handle: () => ticket?.promote(),
			rootMargin: "600px",
			once: true,
		}}
	></div>
{/if}
