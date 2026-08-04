import z from "zod";

import { fetchRest } from "$lib/api/transport";
import { mediaUrlSchema } from "$lib/model/media";
import { unixTimestampMsSchema } from "$lib/model/types";

const drawerMediaSchema = z.object({
	id: z.int(),
	url: mediaUrlSchema,
	contentType: z.string(),
	createdTs: unixTimestampMsSchema,
	used: z.boolean(),
	takenOnGrindr: z.boolean(),
});

export type DrawerMedia = z.infer<typeof drawerMediaSchema>;

export async function getDrawerMedia(conversationId: string) {
	return await fetchRest(`/v4/chat/media/drawer/${conversationId}`).then(
		(res) => res.jsonParsed(z.array(drawerMediaSchema)),
	);
}

export async function saveMediaToDrawer(mediaId: number): Promise<void> {
	await fetchRest(`/v4/chat/media/drawer/${mediaId}`, { method: "PUT" }).then(
		(res) => res.assertOk(),
	);
}
