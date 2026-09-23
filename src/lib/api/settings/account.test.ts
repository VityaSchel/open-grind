import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

const { fetchRestMock, assertOkMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	assertOkMock: vi.fn(),
}));

vi.mock("$lib/api/transport", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/transport")>()),
	fetchRest: fetchRestMock,
}));

import {
	getPushSettings,
	registerPushToken,
	setPushSettings,
	unregisterPushToken,
} from "$lib/api/settings/account";

function respondWith(body: unknown) {
	fetchRestMock.mockResolvedValue({
		jsonParsed: (schema: z.ZodType) => schema.parse(body),
		assertOk: assertOkMock,
	});
}

beforeEach(() => {
	fetchRestMock.mockReset();
	assertOkMock.mockReset();
	respondWith({});
});

describe("registerPushToken", () => {
	it("posts the FCM registration exactly as given", async () => {
		await registerPushToken({
			vendorProvidedIdentifier: "fid",
			token: "fid:APA91b",
		});

		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/v3/gcm-push-tokens",
			{
				method: "POST",
				body: { vendorProvidedIdentifier: "fid", token: "fid:APA91b" },
			},
		);
		expect(assertOkMock).toHaveBeenCalledOnce();
	});
});

describe("unregisterPushToken", () => {
	it("deletes the token with its colon escaped in the path", async () => {
		await unregisterPushToken("fid:APA91b");

		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/v3/push-tokens/fid%3AAPA91b",
			{ method: "DELETE" },
		);
		expect(assertOkMock).toHaveBeenCalledOnce();
	});
});

describe("push settings", () => {
	it("reads them with a GET", async () => {
		respondWith({
			favoritePushNotification: false,
			tapPushNotification: true,
		});

		expect(await getPushSettings()).toEqual({
			favoritePushNotification: false,
			tapPushNotification: true,
		});
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/v5/push-settings",
		);
	});

	it("writes them with a PUT of the settings themselves", async () => {
		await setPushSettings({ tapPushNotification: false });

		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/v5/push-settings",
			{ method: "PUT", body: { tapPushNotification: false } },
		);
		expect(assertOkMock).toHaveBeenCalledOnce();
	});
});
