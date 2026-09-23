<script lang="ts">
	import { goto } from "$app/navigation";
	import { DotsThreeVerticalIcon, TrashIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { showErrorToast } from "$lib/api/error-toast";
	import { deleteAlbum } from "$lib/api/messaging/albums";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { traverseBackTo } from "$lib/util/history";

	let { albumId, saving = false }: { albumId: number; saving?: boolean } =
		$props();

	let confirming = $state(false);
	let deleting = $state(false);

	async function remove() {
		deleting = true;
		try {
			await deleteAlbum({ albumId });
			toast.success("Your album has been deleted");
			if (!traverseBackTo("/settings/albums"))
				await goto("/settings/albums", { replaceState: true });
		} catch (error) {
			console.error(error);
			showErrorToast({ label: "Couldn't delete album", error });
		} finally {
			deleting = false;
		}
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-lg"
				class="size-12"
				aria-label="Album menu"
				disabled={deleting || saving}
			>
				<DotsThreeVerticalIcon class="size-6" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item
			variant="destructive"
			onSelect={() => (confirming = true)}
		>
			<TrashIcon class="size-5" />
			Delete album
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete album?</AlertDialog.Title>
			<AlertDialog.Description>
				This album and everything in it will be deleted, and anyone you
				shared it with will lose access. This cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">Cancel</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					confirming = false;
					void remove();
				}}
			>
				Delete
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
