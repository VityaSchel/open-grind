<script lang="ts">
	import { goto } from "$app/navigation";
	import { CaretRightIcon, SignOutIcon } from "phosphor-svelte";

	import { callMethod } from "$lib/api";
	import { clearProfileCaches } from "$lib/api/users/profiles";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import * as Item from "$lib/components/ui/item";
	import ButtonItemContent from "./ButtonItemContent.svelte";

	async function onSignOut() {
		try {
			await callMethod("logout");
		} catch (error) {
			console.error(error);
		}
		clearProfileCaches();
		await goto("/auth/sign-in");
	}

	let alertOpen = $state(false);
</script>

<Item.Root variant="outline">
	{#snippet child({ props })}
		<ButtonItemContent
			{...props}
			variant="outline"
			onclick={() => (alertOpen = true)}
		>
			<Item.Media>
				<SignOutIcon weight="fill" class="size-5" />
			</Item.Media>
			<Item.Content class="min-w-0">
				<Item.Title class="truncate min-w-0 w-full inline-block text-left">
					Sign Out
				</Item.Title>
			</Item.Content>
			<Item.Actions>
				<CaretRightIcon class="size-4" />
			</Item.Actions>
		</ButtonItemContent>
	{/snippet}
</Item.Root>
<AlertDialog.Root bind:open={alertOpen}>
	<AlertDialog.Content preventOverflowTextSelection={false}>
		<AlertDialog.Header>
			<AlertDialog.Title>Sign out?</AlertDialog.Title>
			<AlertDialog.Description>
				Are you sure you want to sign out? You can sign back in at any time.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={() => onSignOut()} size="lg">
				Continue
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
