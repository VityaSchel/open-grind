import z from "zod";
import type { Page } from "@playwright/test";

import { conversationIdBetween, liveAccounts } from "./accounts";
import { appRequest } from "./app";
import type { Ledger } from "./ledger";

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
