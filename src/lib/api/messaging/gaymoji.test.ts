import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { getGaymoji } from "$lib/api/messaging/gaymoji";
import { toBase64 } from "$lib/util/base64";

const manifest = {
	lastUpdateTime: 1605145583000,
	category: [
		{ name: "wen_ching_taiwan_stickers", expiredTime: 1621843200000 },
		{ name: "featured", expiredTime: 0 },
	],
	gaymoji: [
		{ name: "1_2_Yass", id: "1_2_Yass.png", category: "featured" },
		{
			name: "Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard",
			id: "Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
			category: "profile",
		},
		{
			name: "f_Male_to_female_with_dark_skin_tone.",
			id: "f_Male_to_female_with_dark_skin_tone..png",
			category: "profile",
		},
		{
			name: "man_b_Hairy_body",
			id: "man_b_Hairy_body.png",
			category: "body",
		},
		{
			expiredTime: 1621843200000,
			name: "wen_ching_01_hi",
			id: "wen_ching_01_hi.png",
			category: "wen_ching_taiwan_stickers",
		},
	],
};

function respondWithManifest() {
	invokeMock.mockResolvedValueOnce(
		toBase64(
			encode({
				status: 200,
				body: new TextEncoder().encode(JSON.stringify(manifest)),
			}),
		),
	);
}

beforeEach(() => {
	invokeMock.mockReset();
	clearAccountCaches();
});

describe("getGaymoji", () => {
	it("fetches the manifest from Grindr's CDN", async () => {
		respondWithManifest();

		await getGaymoji();

		expect(invokeMock).toHaveBeenCalledExactlyOnceWith("fetch_external", {
			url: "https://cdns.grindr.com/grindr/chat/gaymoji",
		});
	});

	it("lists every item in manifest order, expired ones included", async () => {
		respondWithManifest();

		const items = await getGaymoji();

		expect(items.map(({ id }) => id)).toEqual(
			manifest.gaymoji.map(({ id }) => id),
		);
	});

	it("describes an item for sending and showing", async () => {
		respondWithManifest();

		const [yass] = await getGaymoji();

		expect(yass).toEqual({
			id: "1_2_Yass.png",
			label: "Yass",
			imageUrl:
				"https://cdns.grindr.com/grindr/chat/gaymoji/1_2_Yass.png",
			imageHash: "gaymoji/1_2_Yass.png",
		});
	});

	it("encodes the asset name in the image URL", async () => {
		respondWithManifest();

		const items = await getGaymoji();

		expect(items[1]?.imageUrl).toBe(
			"https://cdns.grindr.com/grindr/chat/gaymoji/Man_with_medium-light_skin_tone_buzzed_hair%2C_and_blonde_beard.png",
		);
		expect(items[1]?.imageHash).toBe(
			"gaymoji/Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
		);
	});

	it("labels items in words without their sort prefixes", async () => {
		respondWithManifest();

		const items = await getGaymoji();

		expect(items.map(({ label }) => label)).toEqual([
			"Yass",
			"Man with medium-light skin tone buzzed hair, and blonde beard",
			"Male to female with dark skin tone",
			"Hairy body",
			"wen ching 01 hi",
		]);
	});

	it("fetches the manifest once per session", async () => {
		respondWithManifest();

		await getGaymoji();
		await getGaymoji();

		expect(invokeMock).toHaveBeenCalledTimes(1);
	});

	it("fetches again after a failure", async () => {
		invokeMock.mockRejectedValueOnce({ kind: "Connect" });
		respondWithManifest();

		await expect(getGaymoji()).rejects.toThrow();
		await expect(getGaymoji()).resolves.toHaveLength(5);
		expect(invokeMock).toHaveBeenCalledTimes(2);
	});
});
