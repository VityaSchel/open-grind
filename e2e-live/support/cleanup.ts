import type { Page } from "@playwright/test";

import { liveAccounts } from "./accounts";
import { myAlbums } from "./albums";
import { appRequest } from "./app";
import { liveConversationId, recordLiveConversation } from "./chat";
import { counterpart } from "./counterpart";
import {
	albumContentOf,
	cleanUpLedger,
	type Ledger,
	type LedgerCleaners,
} from "./ledger";
import { liveNamePrefix } from "./names";

export class CleanupError extends Error {
	override name = "CleanupError";
}

async function expectGone({
	page,
	method,
	path,
	target,
}: {
	page: Page;
	method: "DELETE";
	path: string;
	target: number;
}) {
	const { status } = await appRequest({ page, method, path, target });
	if (status >= 300 && status !== 404) {
		throw new CleanupError(`${method} ${path} answered ${status}`);
	}
}

export async function deleteLiveConversation(page: Page) {
	await counterpart.deleteConversation();
	await expectGone({
		page,
		method: "DELETE",
		path: `/v4/chat/conversation/${liveConversationId}`,
		target: liveAccounts.counterpart,
	});
}

export function cleanersFor(page: Page): LedgerCleaners {
	return {
		conversation: () => deleteLiveConversation(page),
		album: ({ serverId }) =>
			expectGone({
				page,
				method: "DELETE",
				path: `/v1/albums/${serverId}`,
				target: liveAccounts.app,
			}),
		"album-content": async ({ serverId }) => {
			const { albumId, contentId } = albumContentOf(serverId);
			await expectGone({
				page,
				method: "DELETE",
				path: `/v1/albums/${albumId}/content/${contentId}`,
				target: liveAccounts.app,
			});
		},
		"drawer-media": ({ serverId }) =>
			expectGone({
				page,
				method: "DELETE",
				path: `/v4/chat/media/drawer/${serverId}`,
				target: liveAccounts.app,
			}),
	};
}

export async function leftoverLiveAlbumIds(page: Page) {
	return (await myAlbums(page))
		.filter(({ albumName }) => albumName?.startsWith(liveNamePrefix))
		.map(({ albumId }) => albumId);
}

export async function sweep({
	page,
	ledger,
	stopFile,
}: {
	page: Page;
	ledger: Ledger;
	stopFile: string;
}) {
	for (const albumId of await leftoverLiveAlbumIds(page)) {
		ledger.record({
			kind: "album",
			serverId: albumId,
			owner: liveAccounts.app,
			label: "leftover og-e2e album",
		});
	}
	recordLiveConversation(ledger);
	return await cleanUpLedger({
		ledger,
		cleaners: cleanersFor(page),
		stopFile,
	});
}
