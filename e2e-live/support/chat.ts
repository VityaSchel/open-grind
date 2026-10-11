import { expect, type Page } from "@playwright/test";
import z from "zod";

import { conversationIdBetween, liveAccounts } from "./accounts";
import { appRequest } from "./app";
import type { Ledger } from "./ledger";
import { pickNewestPhoto, pushUniquePhoto } from "./photo-picker";

export const liveConversationId = conversationIdBetween(
	liveAccounts.app,
	liveAccounts.counterpart,
);

export function recordLiveConversation(ledger: Ledger) {
	return ledger.record({
		kind: "conversation",
		serverId: liveConversationId,
		owner: liveAccounts.app,
		label: "conversation with the counterpart",
	});
}

export async function drawerMediaIds(page: Page) {
	const response = await appRequest({
		page,
		method: "GET",
		path: "/v4/chat/media/drawer",
	});
	return z
		.array(z.object({ id: z.coerce.string() }))
		.parse(response.json())
		.map(({ id }) => id);
}

export async function uploadUniquePhotoToDrawer({
	page,
	ledger,
	label,
}: {
	page: Page;
	ledger: Ledger;
	label: string;
}) {
	const drawerBefore = new Set(await drawerMediaIds(page));
	await pushUniquePhoto();
	await page.getByRole("button", { name: "Add attachment" }).click();
	await page.getByRole("tab", { name: "Media" }).click();
	await page
		.getByRole("button", { name: "Upload photos or videos" })
		.first()
		.click();
	await pickNewestPhoto({ multiple: true });
	await expect
		.poll(
			async () => {
				const added = (await drawerMediaIds(page)).filter(
					(id) => !drawerBefore.has(id),
				);
				for (const id of added) {
					ledger.record({
						kind: "drawer-media",
						serverId: id,
						owner: liveAccounts.app,
						label,
					});
				}
				return added.length;
			},
			{ timeout: 120_000 },
		)
		.toBeGreaterThan(0);
}
