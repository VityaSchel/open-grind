import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const { fetchRestMock, preferences } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	preferences: { geohash: null as string | null },
}));

vi.mock("#lib/api/transport.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/transport.ts")>()),
	fetchRest: fetchRestMock,
}));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: () => Promise.resolve({ geohash: preferences.geohash }),
}));

import { clearAccountCaches } from "#lib/api/account-caches.ts";
import {
	getAssignments,
	getPublicAssignments,
	isAssignmentOn,
} from "#lib/api/analytics/assignments.ts";
import { resetNowForTesting, setNowForTesting } from "#lib/util/clock.ts";

const MADRID = "ezjmgtwuz2n0";
const MADRID_COARSE = "ezjmgtwy4dck";
const BERLIN = "u33dc0cpjzrn";
const BERLIN_COARSE = "u33dc0cppjs7";
const KEY = "right-now-moderation";
const FIVE_MINUTES = 5 * 60_000;

function respondWith(body: unknown) {
	fetchRestMock.mockResolvedValue({
		status: 200,
		jsonParsed: (schema: ZodType) => schema.parse(body),
	});
}

function respondWithFlag(value: string | null) {
	respondWith({
		assignments: [{ key: KEY, value, payload: {}, type: "FEATURE_FLAG" }],
	});
}

beforeEach(() => {
	fetchRestMock.mockReset();
	preferences.geohash = MADRID;
	clearAccountCaches();
});

afterEach(() => {
	resetNowForTesting();
});

describe("getAssignments", () => {
	it("asks for the coarsened geohash and returns the assignments", async () => {
		respondWithFlag("on");

		expect(await getAssignments({ geohash: MADRID })).toEqual([
			{ key: KEY, value: "on", payload: {}, type: "FEATURE_FLAG" },
		]);
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			`/v3/assignment?geohash=${MADRID_COARSE}`,
		);
	});
});

describe("getPublicAssignments", () => {
	it("reads the public assignments", async () => {
		respondWithFlag("off");

		expect(await getPublicAssignments()).toEqual([
			{ key: KEY, value: "off", payload: {}, type: "FEATURE_FLAG" },
		]);
		expect(fetchRestMock).toHaveBeenCalledExactlyOnceWith(
			"/public/v1/assignments",
		);
	});
});

describe("isAssignmentOn", () => {
	it.each([
		["on", true],
		["off", false],
		["ON", false],
		[" on", false],
		[null, false],
	])("reads the value %j as %s", async (value, on) => {
		respondWithFlag(value);

		expect(await isAssignmentOn({ key: KEY })).toBe(on);
	});

	it("reads only the asked key", async () => {
		respondWith({
			assignments: [
				{ key: "ai-consent-2026", value: "on", payload: {}, type: "" },
			],
		});

		expect(await isAssignmentOn({ key: KEY })).toBe(false);
		expect(await isAssignmentOn({ key: "ai-consent-2026" })).toBe(true);
	});

	it("is off without a stored location and never asks the server", async () => {
		preferences.geohash = null;
		respondWithFlag("on");

		expect(await isAssignmentOn({ key: KEY })).toBe(false);
		expect(fetchRestMock).not.toHaveBeenCalled();
	});

	it("is off when the request fails, and asks again next time", async () => {
		fetchRestMock.mockRejectedValueOnce(new Error("offline"));

		expect(await isAssignmentOn({ key: KEY })).toBe(false);

		respondWithFlag("on");
		expect(await isAssignmentOn({ key: KEY })).toBe(true);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("is off when the server answers with an error status", async () => {
		fetchRestMock.mockResolvedValue({
			status: 500,
			jsonParsed: () => {
				throw new Error("API request failed with status 500");
			},
		});

		expect(await isAssignmentOn({ key: KEY })).toBe(false);
	});

	it("keeps the answer for five minutes", async () => {
		let clock = 1_000;
		setNowForTesting(() => clock);
		respondWithFlag("on");
		expect(await isAssignmentOn({ key: KEY })).toBe(true);

		respondWithFlag("off");
		clock += FIVE_MINUTES - 1;
		expect(await isAssignmentOn({ key: KEY })).toBe(true);
		expect(fetchRestMock).toHaveBeenCalledOnce();

		clock += 1;
		expect(await isAssignmentOn({ key: KEY })).toBe(false);
		expect(fetchRestMock).toHaveBeenCalledTimes(2);
	});

	it("asks again for a new location", async () => {
		respondWithFlag("on");
		expect(await isAssignmentOn({ key: KEY })).toBe(true);

		preferences.geohash = BERLIN;
		respondWithFlag("off");

		expect(await isAssignmentOn({ key: KEY })).toBe(false);
		expect(fetchRestMock).toHaveBeenLastCalledWith(
			`/v3/assignment?geohash=${BERLIN_COARSE}`,
		);
	});

	it("forgets the answer on sign-out", async () => {
		respondWithFlag("on");
		expect(await isAssignmentOn({ key: KEY })).toBe(true);

		clearAccountCaches();
		respondWithFlag("off");

		expect(await isAssignmentOn({ key: KEY })).toBe(false);
	});
});
