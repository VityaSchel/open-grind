<script lang="ts">
	import {
		answerAccountSwitch,
		googleHandoffState,
	} from "$lib/api/google-handoff-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";

	const switching = $derived(googleHandoffState.phase === "switchingAccount");
	const open = $derived(
		switching || googleHandoffState.phase === "confirmingSwitch",
	);
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
				<Button onclick={() => answerAccountSwitch(true)}>
					{#if switching}
						<Spinner />
					{/if}
					Continue
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
