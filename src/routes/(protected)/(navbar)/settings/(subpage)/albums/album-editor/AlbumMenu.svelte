<script lang="ts">
	import { goto } from "$app/navigation";
	import { DotsThreeVerticalIcon, TrashIcon } from "phosphor-svelte";
	import { toast } from "svelte-sonner";

	import { getMyAlbumsState } from "$lib/albums/my-albums-state.svelte";
	import { showErrorToast } from "$lib/api/error-toast";
	import { deleteAlbum } from "$lib/api/messaging/albums";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import { t } from "$lib/i18n";
	import { traverseBackTo } from "$lib/util/history";

	let {
		albumId,
		ourProfileId,
		saving = false,
	}: { albumId: number; ourProfileId: number; saving?: boolean } = $props();

	let confirming = $state(false);
	let deleting = $state(false);

	async function remove() {
		deleting = true;
		try {
			await deleteAlbum({ albumId });
			getMyAlbumsState(ourProfileId).remove(albumId);
			toast.success(t("media.albums.editor.menu.deleted"));
			if (!traverseBackTo("/settings/albums"))
				await goto("/settings/albums", { replaceState: true });
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: t("media.albums.editor.menu.errors.deleteFailed"),
				error,
			});
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
				aria-label={t("media.albums.editor.menu.a11y.trigger")}
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
			{t("media.albums.editor.menu.delete")}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
<AlertDialog.Root bind:open={confirming}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>
				{t("media.albums.editor.menu.confirm.title")}
			</AlertDialog.Title>
			<AlertDialog.Description>
				{t("media.albums.editor.menu.confirm.description")}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel size="lg">
				{t("common.actions.cancel")}
			</AlertDialog.Cancel>
			<AlertDialog.Action
				variant="destructive"
				size="lg"
				onclick={() => {
					confirming = false;
					void remove();
				}}
			>
				{t("common.actions.delete")}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
