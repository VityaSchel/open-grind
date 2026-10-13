import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ screenshots: true }));

vi.mock("$lib/demo/config", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./config")>();
	return {
		...actual,
		demoEnabled: true,
		get screenshotsEnabled() {
			return flags.screenshots;
		},
	};
});

import {
	BlockedProfileError,
	clearProfileCaches,
	getProfile,
} from "$lib/api/users/profiles";
import { profileSchema } from "$lib/model/users/profiles";
import { demoRoute } from "./route";
import { type ScreenshotScene, screenshotScene } from "./screenshot-scene";

const PATCHED_ID = 100001;
const UNPATCHED_ID = 100002;
const BLOCKED_BY_US_ID = 100801;
const VISITING_UNREAD = 120;

const initialScene = structuredClone(screenshotScene);

function setScene(scene: Partial<ScreenshotScene>): void {
	Object.assign(screenshotScene, scene);
}

function fetchedProfile(profileId: number) {
	const { body } = demoRoute({
		path: `/v7/profiles/${profileId}`,
		method: "GET",
		body: undefined,
	});
	const [profile] = (body as { profiles: unknown[] }).profiles;
	return profileSchema.parse(profile);
}

type CascadeTile = {
	data: {
		profileId: number;
		isVisiting: boolean;
		unreadCount: number;
		onlineUntil: number | null;
	};
};

function gridTiles(): CascadeTile[] {
	const { body } = demoRoute({
		path: "/v4/cascade?pageNumber=0",
		method: "GET",
		body: undefined,
	});
	return (body as { items: CascadeTile[] }).items;
}

async function blockedByUs(profileId: number): Promise<boolean> {
	const error: unknown = await getProfile(profileId).catch(
		(caught: unknown) => caught,
	);
	if (!(error instanceof BlockedProfileError)) {
		throw new Error(`Profile ${profileId} was not blocked`);
	}
	return error.blockedByUs;
}

afterEach(() => {
	Object.assign(screenshotScene, structuredClone(initialScene));
	flags.screenshots = true;
	clearProfileCaches();
});

describe("scene profiles", () => {
	it("answers a profile with the scene's fields over the demo's", () => {
		setScene({
			profiles: {
				[PATCHED_ID]: {
					isNew: true,
					onlineUntil: null,
					seen: null,
					nsfw: 3,
					meetAt: [1, 4],
					tapType: 2,
				},
			},
		});
		expect(fetchedProfile(PATCHED_ID)).toMatchObject({
			isNew: true,
			onlineUntil: null,
			seen: null,
			nsfw: 3,
			meetAt: [1, 4],
			tapType: 2,
		});
		expect(fetchedProfile(UNPATCHED_ID)).toMatchObject({
			nsfw: null,
			meetAt: [],
			tapType: null,
		});
	});

	it("shows a grid tile visiting, online and with the scene's unread count", () => {
		const [first, second] = gridTiles();
		if (first === undefined || second === undefined) {
			throw new Error("The demo grid has fewer than two tiles");
		}
		setScene({
			profiles: {
				[first.data.profileId]: {
					isVisiting: true,
					onlineUntil: null,
					unreadCount: VISITING_UNREAD,
				},
			},
		});
		const [patched, untouched] = gridTiles();
		expect(patched?.data).toMatchObject({
			isVisiting: true,
			onlineUntil: null,
			unreadCount: VISITING_UNREAD,
		});
		expect(untouched?.data).toEqual(second.data);
	});

	it("masks a profile as blocked by them, or by us when we blocked it", async () => {
		setScene({ maskedProfiles: [PATCHED_ID, BLOCKED_BY_US_ID] });
		expect(await blockedByUs(PATCHED_ID)).toBe(false);
		expect(await blockedByUs(BLOCKED_BY_US_ID)).toBe(true);
		await expect(getProfile(UNPATCHED_ID)).resolves.toMatchObject({
			profileId: UNPATCHED_ID,
		});
	});

	it("keeps the demo's profiles without the flag", async () => {
		const [tile] = gridTiles();
		if (tile === undefined) throw new Error("The demo grid is empty");
		setScene({
			profiles: {
				[PATCHED_ID]: { isNew: true, nsfw: 3 },
				[tile.data.profileId]: { isVisiting: true },
			},
			maskedProfiles: [UNPATCHED_ID],
		});
		flags.screenshots = false;
		expect(fetchedProfile(PATCHED_ID)).toMatchObject({
			isNew: false,
			nsfw: null,
		});
		expect(gridTiles()[0]?.data.isVisiting).toBe(false);
		await expect(getProfile(UNPATCHED_ID)).resolves.toMatchObject({
			profileId: UNPATCHED_ID,
		});
	});
});
