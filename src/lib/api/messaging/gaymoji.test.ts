import { encode } from "@msgpack/msgpack";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import { gaymojiFromImageHash, getGaymoji } from "$lib/api/messaging/gaymoji";
import { toBase64 } from "$lib/util/base64";

const manifest = {
	lastUpdateTime: 1605145583000,
	category: [
		{ name: "wen_ching_taiwan_stickers", expiredTime: 1621843200000 },
		{ name: "featured", expiredTime: 0 },
		{ name: "mood", expiredTime: 0 },
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

	it("groups items in the manifest's category order, then the categories it misses, expired ones included", async () => {
		respondWithManifest();

		const categories = await getGaymoji();

		expect(
			categories.map(({ name, items }) => [
				name,
				items.map(({ id }) => id),
			]),
		).toEqual([
			["wen_ching_taiwan_stickers", ["wen_ching_01_hi.png"]],
			["featured", ["1_2_Yass.png"]],
			[
				"profile",
				[
					"Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
					"f_Male_to_female_with_dark_skin_tone..png",
				],
			],
			["body", ["man_b_Hairy_body.png"]],
		]);
	});

	it("describes an item for sending and showing", async () => {
		respondWithManifest();

		const [, featured] = await getGaymoji();

		expect(featured?.items[0]).toEqual({
			id: "1_2_Yass.png",
			label: "Yass",
			imageUrl:
				"https://cdns.grindr.com/grindr/chat/gaymoji/1_2_Yass.png",
			imageHash: "gaymoji/1_2_Yass.png",
		});
	});

	it("encodes the asset name in the image URL", async () => {
		respondWithManifest();

		const [, , profile] = await getGaymoji();
		const [beard] = profile?.items ?? [];

		expect(beard?.imageUrl).toBe(
			"https://cdns.grindr.com/grindr/chat/gaymoji/Man_with_medium-light_skin_tone_buzzed_hair%2C_and_blonde_beard.png",
		);
		expect(beard?.imageHash).toBe(
			"gaymoji/Man_with_medium-light_skin_tone_buzzed_hair,_and_blonde_beard.png",
		);
	});

	it("labels items in words without their sort prefixes", async () => {
		respondWithManifest();

		const categories = await getGaymoji();

		expect(
			categories.flatMap(({ items }) => items.map(({ label }) => label)),
		).toEqual([
			"wen ching 01 hi",
			"Yass",
			"Man with medium-light skin tone buzzed hair, and blonde beard",
			"Male to female with dark skin tone",
			"Hairy body",
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
		await expect(getGaymoji()).resolves.toHaveLength(4);
		expect(invokeMock).toHaveBeenCalledTimes(2);
	});
});

describe("gaymojiFromImageHash", () => {
	it("shows a sent Gaymoji the way the sheet shows it", () => {
		expect(gaymojiFromImageHash("gaymoji/1_2_Yass.png")).toEqual({
			imageUrl:
				"https://cdns.grindr.com/grindr/chat/gaymoji/1_2_Yass.png",
			label: "Yass",
		});
	});

	it("keeps a crafted hash inside the Gaymoji folder", () => {
		expect(gaymojiFromImageHash("gaymoji/../avatar.png").imageUrl).toBe(
			"https://cdns.grindr.com/grindr/chat/gaymoji/..%2Favatar.png",
		);
	});
});
