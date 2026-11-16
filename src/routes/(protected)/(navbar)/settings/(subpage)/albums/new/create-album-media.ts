import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	createAlbum,
	getAlbumStorageLimits,
} from "#lib/api/messaging/albums.ts";
import { albumRoom } from "#lib/components/album/album.ts";
import { t } from "#lib/i18n/index.ts";
import { discardStagedMedia } from "#lib/platform/media-file.ts";
import type { MyAlbumsState } from "#lib/albums/my-albums-state.svelte.ts";
import type { ScreenedMedia } from "#lib/platform/media-intake.svelte.ts";
import type { PickedMedia } from "#lib/platform/media-picker.ts";
import {
	enqueueAlbumMedia,
	pickOrScreenAlbumMedia,
} from "../album-uploads/add-album-media";
import {
	type AlbumUploads,
	isPlanLimitReached,
} from "../album-uploads/album-uploads-state.svelte";

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
	let inspected: ScreenedMedia[] = [];
	try {
		const limits = await getAlbumStorageLimits();
		inspected = await pickOrScreenAlbumMedia({
			room: albumRoom({ content: [], pending: [], limits }),
			media,
		});
		if (inspected.length === 0) return;
		const { albumId } = await createAlbum({ albumName });
		void myAlbums.reload();
		await goto(`/settings/albums/${albumId}`, { replace: true });
		enqueueAlbumMedia({ uploads, albumId, inspected, limits, content: [] });
	} catch (error) {
		console.error(error);
		void discardStagedMedia(media ?? inspected.map((pick) => pick.media));
		if (isPlanLimitReached(error)) {
			toast.error(t("media.albums.new.errors.albumLimit"));
			return;
		}
		showErrorToast({
			label: t("media.albums.new.errors.createFailed"),
			error,
		});
	}
}
