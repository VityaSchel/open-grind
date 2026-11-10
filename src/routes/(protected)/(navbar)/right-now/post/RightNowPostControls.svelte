<script lang="ts">
	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import JoinButton from "./JoinButton.svelte";
	import JoinConfirmDialog from "./JoinConfirmDialog.svelte";
	import RightNowPostSheet from "./RightNowPostSheet.svelte";

	let {
		post,
		compact = false,
		sheetOpen = $bindable(false),
	}: {
		post: RightNowPostState;
		compact?: boolean;
		sheetOpen?: boolean;
	} = $props();

	let confirmOpen = $state(false);

	$effect(() => post.attachView());

	$effect(() => post.onSheetRequest(() => (sheetOpen = true)));
</script>

<JoinButton
	{post}
	{compact}
	onjoin={() => (confirmOpen = true)}
	onopen={() => (sheetOpen = true)}
/>
<JoinConfirmDialog
	bind:open={confirmOpen}
	{post}
	onjoined={() => (sheetOpen = true)}
/>
<RightNowPostSheet bind:open={sheetOpen} {post} />
