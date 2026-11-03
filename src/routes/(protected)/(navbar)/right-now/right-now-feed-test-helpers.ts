import { expect, vi } from "vitest";

import type {
	PostData,
	RightNowFeedResponse,
	RightNowFeedResponseItem,
} from "#lib/model/right-now/feed.ts";
import { discreetPostData, postData } from "./feed-post-test-helpers";
import { RightNowFeedState } from "./right-now-feed-state.svelte";

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

const createdStates: RightNowFeedState[] = [];

export function createState(): RightNowFeedState {
	const state = new RightNowFeedState();
	createdStates.push(state);
	return state;
}

export function destroyCreatedStates(): void {
	for (const state of createdStates.splice(0)) state.destroy();
}

export function post(
	profileId: number,
	overrides: Partial<PostData> = {},
): RightNowFeedResponseItem {
	return {
		type: "right_now_post_v3",
		data: postData({ id: profileId, profileId, ...overrides }),
	};
}

export function lockedPost(profileId: number): RightNowFeedResponseItem {
	return {
		type: "locked_post_v1",
		data: postData({ id: profileId, profileId }),
	};
}

export function discreetPost(id: number): RightNowFeedResponseItem {
	return {
		type: "discreet_right_now_post_v1",
		data: discreetPostData({ id, hosting: true }),
	};
}

export function curatedPost(): RightNowFeedResponseItem {
	return { type: "curated_post_v1", data: { type: "tutorial_hosting_v1" } };
}

export function upsellInsert(): RightNowFeedResponseItem {
	return { type: "upsell_insert_v1", data: { type: "xtra_upsell_v1" } };
}

export function feed(items: RightNowFeedResponseItem[]): RightNowFeedResponse {
	return { items, viewerCount: 0 };
}

export function shown(state: RightNowFeedState) {
	return state.entries.map((item) =>
		"profileId" in item.data ? item.data.profileId : item.type,
	);
}

export async function waitForLoaded(state: RightNowFeedState) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}
