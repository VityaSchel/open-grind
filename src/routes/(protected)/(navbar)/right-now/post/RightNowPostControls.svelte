<script lang="ts">
	import { untrack } from "svelte";

	import type { RightNowPostState } from "../right-now-post-state.svelte";
	import JoinButton from "./JoinButton.svelte";
	import JoinConfirmDialog from "./JoinConfirmDialog.svelte";
	import RightNowPostSheet from "./RightNowPostSheet.svelte";

	let {
		post,
		sheetOpen = $bindable(false),
	}: { post: RightNowPostState; sheetOpen?: boolean } = $props();

	let confirmOpen = $state(false);

	$effect(() => {
		const current = post;
		return untrack(() => current.attachView());
	});

	$effect(() => {
		const current = post;
		return untrack(() =>
			current.onSheetRequest(() => {
				sheetOpen = true;
			}),
		);
	});
</script>

<JoinButton
	{post}
	onjoin={() => (confirmOpen = true)}
	onopen={() => (sheetOpen = true)}
/>
<JoinConfirmDialog
	bind:open={confirmOpen}
	{post}
	onjoined={() => (sheetOpen = true)}
/>
<RightNowPostSheet bind:open={sheetOpen} {post} />
