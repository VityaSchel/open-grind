import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import {
	deleteDrawerMedia,
	getAllDrawerMedia,
} from "$lib/api/messaging/drawer";

const assertOk = vi.fn();
const jsonParsed = vi.fn();

beforeEach(() => {
	assertOk.mockReset();
	jsonParsed.mockReset();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({ assertOk, jsonParsed });
});

describe("drawer API wrappers", () => {
	it("lists the whole drawer, not one conversation's", async () => {
		jsonParsed.mockReturnValue([]);

		await expect(getAllDrawerMedia()).resolves.toEqual([]);

		expect(fetchRestMock).toHaveBeenCalledWith("/v4/chat/media/drawer");
	});

	it("deletes one drawer item by its media id and asserts the status", async () => {
		await deleteDrawerMedia(2_526_256_877);

		expect(fetchRestMock).toHaveBeenCalledWith(
			"/v4/chat/media/drawer/2526256877",
			{ method: "DELETE" },
		);
		expect(assertOk).toHaveBeenCalledOnce();
	});
});
