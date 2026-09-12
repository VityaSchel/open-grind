<script lang="ts">
	import {
		googleHandbackConfirmState,
		settleGoogleHandbackConfirm,
	} from "$lib/api/google-handback-confirm-state.svelte";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
</script>

<AlertDialog.Root
	bind:open={googleHandbackConfirmState.open}
	onOpenChange={(open) => {
		if (!open) settleGoogleHandbackConfirm(false);
	}}
>
	<AlertDialog.Content
		class="max-sm:max-w-[calc(100%-2rem)]!"
		interactOutsideBehavior="close"
	>
		<AlertDialog.Header>
			<AlertDialog.Title>Switch Google account?</AlertDialog.Title>
			<AlertDialog.Description class="text-wrap">
				The companion app signed you in to Google. Using it here signs
				you out of your current account.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Stay signed in</AlertDialog.Cancel>
			<Button onclick={() => settleGoogleHandbackConfirm(true)}>
				Switch account
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
