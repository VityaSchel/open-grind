import type {
	PostData,
	RightNowFeedResponse,
	RightNowFeedResponseItem,
} from "#lib/model/right-now/feed.ts";
import { RightNowFeedState } from "./right-now-feed-state.svelte";

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
const POSTED = 1_710_000_000_000;

const createdStates: RightNowFeedState[] = [];

export function createState(): RightNowFeedState {
	const state = new RightNowFeedState();
	createdStates.push(state);
	return state;
}

export function destroyCreatedStates(): void {
	for (const state of createdStates.splice(0)) state.destroy();
}

function postData(
	profileId: number,
	overrides: Partial<PostData> = {},
): PostData {
	return {
		id: profileId,
		profileId,
		media: [],
		hosting: false,
		posted: POSTED,
		expiration: POSTED + 60 * MINUTE,
		recentlyChatted: false,
		favorite: false,
		...overrides,
	};
}

export function post(
	profileId: number,
	overrides: Partial<PostData> = {},
): RightNowFeedResponseItem {
	return { type: "right_now_post_v3", data: postData(profileId, overrides) };
}

export function lockedPost(profileId: number): RightNowFeedResponseItem {
	return { type: "locked_post_v1", data: postData(profileId) };
}

export function discreetPost(id: number): RightNowFeedResponseItem {
	return {
		type: "discreet_right_now_post_v1",
		data: {
			id,
			hosting: true,
			posted: POSTED,
			expiration: POSTED + 60 * MINUTE,
			profileFields: {
				age: null,
				height: null,
				weight: null,
				position: null,
			},
		},
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

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}
