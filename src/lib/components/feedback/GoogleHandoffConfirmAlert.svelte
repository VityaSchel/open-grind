<script lang="ts">
	import {
		answerAccountSwitch,
		googleHandoffState,
	} from "#lib/api/google-handoff-state.svelte.ts";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import { Spinner } from "#lib/components/ui/spinner/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";

	const switching = $derived(googleHandoffState.phase === "switchingAccount");
	const open = $derived(
		switching || googleHandoffState.phase === "confirmingSwitch",
	);

	dismissOnBackGesture({
		active: () => open,
		dismiss: () => answerAccountSwitch(false),
	});
</script>

<AlertDialog.Root
	bind:open={
		() => open,
		(next) => {
			if (!next) answerAccountSwitch(false);
		}
	}
>
	<AlertDialog.Content interactOutsideBehavior="close">
		<AlertDialog.Header>
			<AlertDialog.Title>Switch Google account?</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				You have signed in to another Google account using the Google
				OAuth app.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={switching} class="contents">
				<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
				<Button
					onclick={() => answerAccountSwitch(true)}
					aria-busy={switching}
				>
					{#if switching}
						<Spinner aria-hidden="true" />
					{/if}
					Continue
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
