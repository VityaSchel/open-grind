<script lang="ts">
	import { rightNowPostSheetRequest } from "#lib/components/right-now/post-sheet-request-state.svelte.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import JoinButton from "./JoinButton.svelte";
	import JoinConfirmDialog from "./JoinConfirmDialog.svelte";
	import RightNowPostSheet from "./RightNowPostSheet.svelte";

	let {
		ownPost,
		compact = false,
		sheetOpen = $bindable(false),
	}: {
		ownPost: RightNowPostState;
		compact?: boolean;
		sheetOpen?: boolean;
	} = $props();

	let confirmOpen = $state(false);
	let postButton = $state<HTMLElement | null>(null);
	let opener: Element | null = null;

	$effect.pre(() => {
		if (sheetOpen) opener = document.activeElement;
	});

	function openerStillFocusable(): boolean {
		return (
			opener instanceof HTMLElement &&
			opener !== document.body &&
			opener.isConnected
		);
	}

	function focusPostButton(event: Event): void {
		if (postButton === null || openerStillFocusable()) return;
		event.preventDefault();
		postButton.focus({ preventScroll: true });
	}

	$effect(() => ownPost.attachView());

	$effect(() => {
		if (!rightNowPostSheetRequest.pending || ownPost.loading) return;
		rightNowPostSheetRequest.take();
		if (ownPost.post !== null) sheetOpen = true;
	});

	$effect(() => () => {
		rightNowPostSheetRequest.take();
	});
</script>

<JoinButton
	bind:ref={postButton}
	{ownPost}
	{compact}
	onjoin={() => (confirmOpen = true)}
	onopen={() => (sheetOpen = true)}
/>
<JoinConfirmDialog
	bind:open={confirmOpen}
	{ownPost}
	onjoined={() => (sheetOpen = true)}
/>
<RightNowPostSheet
	bind:open={sheetOpen}
	{ownPost}
	onCloseAutoFocus={focusPostButton}
/>
