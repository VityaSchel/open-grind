<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";

	let {
		open = $bindable(),
		post,
		onjoined,
	}: {
		open: boolean;
		post: RightNowPostState;
		onjoined: () => void;
	} = $props();

	const escapeKeydownBehavior = $derived(post.joining ? "ignore" : "close");

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			if (!post.joining) open = false;
		},
	});

	async function join() {
		if (post.joining) return;
		const joined = await post.join();
		open = false;
		if (joined) onjoined();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content {escapeKeydownBehavior}>
		<AlertDialog.Header>
			<AlertDialog.Title>Join Right Now?</AlertDialog.Title>
			<AlertDialog.Description>
				You'll show as "Joined" until you add a post.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={post.joining} class="contents">
				<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
				<AlertDialog.Action
					size="lg"
					aria-busy={post.joining}
					onclick={() => void join()}
				>
					{#if post.joining}
						<Spinner aria-hidden="true" />
					{/if}
					Join now
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
