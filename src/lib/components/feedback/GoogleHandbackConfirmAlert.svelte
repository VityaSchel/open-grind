<script lang="ts">
	import {
		answerAccountSwitch,
		googleHandbackState,
	} from "$lib/api/google-handback-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";

	const switching = $derived(
		googleHandbackState.phase === "switchingAccount",
	);
	const open = $derived(
		switching || googleHandbackState.phase === "confirmingSwitch",
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
				You have signed in to another Google account using the companion
				app.
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
