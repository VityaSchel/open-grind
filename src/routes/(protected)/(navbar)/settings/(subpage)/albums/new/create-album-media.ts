import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { createAlbum, getAlbumStorageLimits } from "$lib/api/messaging/albums";
import { albumRoom } from "$lib/components/album/album";
import type { MyAlbumsState } from "$lib/albums/my-albums-state.svelte";
import {
	enqueueAlbumMedia,
	pickInspectedAlbumMedia,
} from "../album-uploads/add-album-media";
import {
	type AlbumUploads,
	isPlanLimitReached,
} from "../album-uploads/album-uploads-state.svelte";

const ALBUM_LIMIT_MESSAGE = "You can't create more albums";

export async function createAlbumFromMedia({
	uploads,
	myAlbums,
	albumName,
}: {
	uploads: AlbumUploads;
	myAlbums: MyAlbumsState;
	albumName: string | null;
}): Promise<void> {
	try {
		const limits = await getAlbumStorageLimits();
		const inspected = await pickInspectedAlbumMedia({
			room: albumRoom({ content: [], pending: [], limits }),
		});
		if (inspected.length === 0) return;
		const { albumId } = await createAlbum({ albumName });
		void myAlbums.reload();
		await goto(`/settings/albums/${albumId}`, { replaceState: true });
		enqueueAlbumMedia({ uploads, albumId, inspected, limits, content: [] });
	} catch (error) {
		console.error(error);
		if (isPlanLimitReached(error)) {
			toast.error(ALBUM_LIMIT_MESSAGE);
			return;
		}
		showErrorToast({ label: "Couldn't create album", error });
	}
}
