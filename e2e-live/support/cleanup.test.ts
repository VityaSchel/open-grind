import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

import { liveAccounts } from "./accounts";
import { appRequest } from "./app";
import { cleanersFor, CleanupError } from "./cleanup";
import type { LedgerEntry } from "./ledger";
import { LedgerError } from "./ledger";

vi.mock("./app", () => ({ appRequest: vi.fn() }));

const page = {} as Page;

function albumContentEntry(serverId: string): LedgerEntry {
	return {
		id: "entry",
		kind: "album-content",
		serverId,
		owner: liveAccounts.app,
		label: "unique album photo",
		createdAt: "2026-09-26T00:00:00.000Z",
		cleanedAt: null,
	};
}

function appAnswers(status: number) {
	vi.mocked(appRequest).mockResolvedValue({ status, json: () => null });
}

beforeEach(() => {
	vi.mocked(appRequest).mockReset();
});

describe("the album content cleaner", () => {
	const cleanAlbumContent = cleanersFor(page)["album-content"];

	it("deletes only that item from its album as the app", async () => {
		appAnswers(200);
		await cleanAlbumContent(albumContentEntry("171895014/1129715920"));
		expect(appRequest).toHaveBeenCalledExactlyOnceWith({
			page,
			method: "DELETE",
			path: "/v1/albums/171895014/content/1129715920",
			target: liveAccounts.app,
		});
	});

	it("treats an item that is already gone as cleaned", async () => {
		appAnswers(404);
		await expect(
			cleanAlbumContent(albumContentEntry("171895014/1129715920")),
		).resolves.toBeUndefined();
	});

	it("fails when the server keeps the item", async () => {
		appAnswers(500);
		await expect(
			cleanAlbumContent(albumContentEntry("171895014/1129715920")),
		).rejects.toThrow(CleanupError);
	});

	it("never sends a request for an entry without a content id", async () => {
		await expect(
			cleanAlbumContent(albumContentEntry("171895014")),
		).rejects.toThrow(LedgerError);
		expect(appRequest).not.toHaveBeenCalled();
	});
});
