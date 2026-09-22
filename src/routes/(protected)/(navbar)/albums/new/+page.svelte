<script lang="ts">
	import { page } from "$app/state";
	import ImagesIcon from "phosphor-svelte/lib/ImagesIcon";
	import PlusIcon from "phosphor-svelte/lib/PlusIcon";

	import AlbumNameField from "$lib/components/album/AlbumNameField.svelte";
	import MediaImage from "$lib/components/shared/MediaImage.svelte";
	import { Button } from "$lib/components/ui/button";
	import * as Empty from "$lib/components/ui/empty";
	import AlbumHeaderLayout from "../album-editor/AlbumHeaderLayout.svelte";
	import { getAlbumUploads } from "../album-uploads/album-uploads-state.svelte";
	import { createAlbumFromMedia } from "./create-album-media";

	let albumName = $state("");
	let creating = $state(false);

	async function add() {
		creating = true;
		try {
			const name = albumName.trim();
			await createAlbumFromMedia({
				uploads: getAlbumUploads(page.data.ourProfileId),
				albumName: name === "" ? null : name,
			});
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>New album</title>
</svelte:head>

<AlbumHeaderLayout>
	{#snippet preview()}
		<MediaImage src={null} class="aspect-3/4 w-full rounded-xl" />
	{/snippet}
	<AlbumNameField bind:value={albumName} disabled={creating} />
</AlbumHeaderLayout>
<Empty.Root>
	<Empty.Header>
		<Empty.Media variant="icon">
			<ImagesIcon weight="fill" />
		</Empty.Media>
		<Empty.Title>Add a photo to start your album</Empty.Title>
		<Empty.Description>
			The album is created once you add its first photo or video.
		</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<Button disabled={creating} onclick={() => void add()}>
			<PlusIcon weight="bold" />
			Add photos or videos
		</Button>
	</Empty.Content>
</Empty.Root>
