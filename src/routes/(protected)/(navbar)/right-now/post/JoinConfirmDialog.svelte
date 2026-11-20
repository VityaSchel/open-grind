<script lang="ts">
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { t } from "#lib/i18n/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import type { RightNowPostState } from "../right-now-post-state.svelte";

	let {
		open = $bindable(),
		ownPost,
		onjoined,
	}: {
		open: boolean;
		ownPost: RightNowPostState;
		onjoined: () => void;
	} = $props();

	const escapeKeydownBehavior = $derived(
		ownPost.joining ? "ignore" : "close",
	);

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => {
			if (!ownPost.joining) open = false;
		},
	});

	async function join() {
		if (ownPost.joining) return;
		const joined = await ownPost.join();
		open = false;
		if (joined) onjoined();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content {escapeKeydownBehavior}>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("browse.rightNow.join.confirm.title")}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{t("browse.rightNow.join.confirm.description")}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={ownPost.joining} class="contents">
				<AlertDialog.Cancel size="lg" data-autofocus>
					{t("common.actions.cancel")}
				</AlertDialog.Cancel>
				<AlertDialog.Action
					size="lg"
					aria-busy={ownPost.joining}
					onclick={() => void join()}
				>
					{#if ownPost.joining}
						<Spinner aria-hidden="true" />
					{/if}
					{t("browse.rightNow.join.confirm.join")}
				</AlertDialog.Action>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
