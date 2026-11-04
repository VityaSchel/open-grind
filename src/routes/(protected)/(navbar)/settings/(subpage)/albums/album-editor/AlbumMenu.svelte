<script lang="ts">
	import DotsThreeVerticalIcon from "phosphor-svelte/lib/DotsThreeVerticalIcon";
	import TrashIcon from "phosphor-svelte/lib/TrashIcon";
	import { toast } from "svelte-sonner";

	import { getMyAlbumsState } from "#lib/albums/my-albums-state.svelte.ts";
	import { showErrorToast } from "#lib/api/error-toast.ts";
	import { deleteAlbum } from "#lib/api/messaging/albums.ts";
	import * as AlertDialog from "#lib/components/ui/alert-dialog/index.ts";
	import { Button } from "#lib/components/ui/button/index.ts";
	import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.ts";
	import { dismissOnBackGesture } from "#lib/platform/back-gesture-event.svelte.ts";
	import { leaveDeletedPages } from "#lib/util/deleted-pages.ts";

	let {
		albumId,
		ourProfileId,
		saving = false,
	}: { albumId: number; ourProfileId: number; saving?: boolean } = $props();

	let confirming = $state(false);
	let deleting = $state(false);

	dismissOnBackGesture({
		active: () => confirming,
		dismiss: () => (confirming = false),
	});

	async function remove() {
		deleting = true;
		try {
			await deleteAlbum({ albumId });
			getMyAlbumsState(ourProfileId).remove(albumId);
			toast.success("Your album has been deleted");
			leaveDeletedPages({
				pathnames: [`/settings/albums/${albumId}`],
				parent: "/settings/albums",
			});
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
