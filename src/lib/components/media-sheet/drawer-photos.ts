import {
	deleteDrawerMedia,
	type DrawerMedia,
	getAllDrawerMedia,
} from "#lib/api/messaging/drawer.ts";
import { isVideoContent } from "#lib/components/album/album.ts";
import { proxyMediaUrl } from "#lib/util/media.ts";
import type { PreviousUploadsProps } from "./previous-uploads";

export const drawerPhotoUploads: Pick<
	PreviousUploadsProps<DrawerMedia>,
	"load" | "describe" | "onDelete"
> = {
	load: async () =>
		(await getAllDrawerMedia()).filter(
			(item) => !isVideoContent(item.contentType),
		),
	describe: (item) => ({
		key: item.id,
		src: proxyMediaUrl(item.url),
		video: false,
	}),
	onDelete: (item) => deleteDrawerMedia(item.id),
};
