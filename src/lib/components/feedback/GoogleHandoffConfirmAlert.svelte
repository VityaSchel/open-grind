<script lang="ts">
	import {
		answerAccountSwitch,
		googleHandoffState,
	} from "$lib/api/google-handoff-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import { Spinner } from "$lib/components/ui/spinner";
	import { t } from "$lib/i18n";
	import { dismissOnBackGesture } from "$lib/platform/back-gesture-event.svelte";

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
			<AlertDialog.Title>
				{t("auth.googleHandoff.switchAccount.title")}
			</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				{t("auth.googleHandoff.switchAccount.description")}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<fieldset disabled={switching} class="contents">
				<AlertDialog.Cancel
					>{t("common.actions.cancel")}</AlertDialog.Cancel
				>
				<Button
					onclick={() => answerAccountSwitch(true)}
					aria-busy={switching}
				>
					{#if switching}
						<Spinner aria-hidden="true" />
					{/if}
					{t("common.actions.continue")}
				</Button>
			</fieldset>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
