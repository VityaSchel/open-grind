import z from "zod";
import type { Page } from "@playwright/test";

import { conversationIdBetween, liveAccounts } from "./accounts";
import { appRequest } from "./app";
import { counterpart } from "./counterpart";
import { cleanUpLedger, type Ledger, type LedgerCleaners } from "./ledger";
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
		path: `/v4/chat/conversation/${conversationIdBetween(liveAccounts.app, liveAccounts.counterpart)}`,
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
		"drawer-media": ({ serverId }) =>
			expectGone({
				page,
				method: "DELETE",
				path: `/v4/chat/media/drawer/${serverId}`,
				target: liveAccounts.app,
			}),
	};
}

const myAlbumsSchema = z.object({
	albums: z.array(
		z.object({
			albumId: z.coerce.string(),
			albumName: z.string().nullish(),
		}),
	),
});

export async function leftoverLiveAlbumIds(page: Page) {
	const response = await appRequest({
		page,
		method: "GET",
		path: "/v1/albums",
	});
	return myAlbumsSchema
		.parse(response.json())
		.albums.filter(({ albumName }) => albumName?.startsWith(liveNamePrefix))
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
	ledger.record({
		kind: "conversation",
		serverId: conversationIdBetween(
			liveAccounts.app,
			liveAccounts.counterpart,
		),
		owner: liveAccounts.app,
		label: "conversation with the counterpart",
	});
	return await cleanUpLedger({
		ledger,
		cleaners: cleanersFor(page),
		stopFile,
	});
}
