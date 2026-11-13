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
<RightNowPostSheet bind:open={sheetOpen} {ownPost} />
