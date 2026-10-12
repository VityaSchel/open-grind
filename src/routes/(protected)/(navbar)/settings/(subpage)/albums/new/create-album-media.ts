import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { createAlbum, getAlbumStorageLimits } from "$lib/api/messaging/albums";
import { albumRoom } from "$lib/components/album/album";
import { discardStagedMedia } from "$lib/platform/media-file";
import { screenMedia } from "$lib/platform/media-intake.svelte";
import type { MyAlbumsState } from "$lib/albums/my-albums-state.svelte";
import type { PickedMedia } from "$lib/platform/media-picker";
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
	media,
}: {
	uploads: AlbumUploads;
	myAlbums: MyAlbumsState;
	albumName: string | null;
	media?: PickedMedia[];
}): Promise<void> {
	try {
		const limits = await getAlbumStorageLimits();
		const inspected =
			media === undefined
				? await pickInspectedAlbumMedia({
						room: albumRoom({ content: [], pending: [], limits }),
					})
				: await screenMedia({ media, videos: true });
		if (inspected.length === 0) return;
		const { albumId } = await createAlbum({ albumName });
		void myAlbums.reload();
		await goto(`/settings/albums/${albumId}`, { replaceState: true });
		enqueueAlbumMedia({ uploads, albumId, inspected, limits, content: [] });
	} catch (error) {
		console.error(error);
		void discardStagedMedia(media ?? []);
		if (isPlanLimitReached(error)) {
			toast.error(ALBUM_LIMIT_MESSAGE);
			return;
		}
		showErrorToast({ label: "Couldn't create album", error });
	}
}
