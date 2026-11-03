import type {
	DiscreetPostData,
	PostData,
	RightNowPostMediaItem,
} from "#lib/model/right-now/feed.ts";

const POSTED = 1_710_000_000_000;

export function postData(overrides: Partial<PostData> = {}): PostData {
	return {
		id: 1,
		profileId: 200,
		media: [],
		hosting: false,
		posted: POSTED,
		expiration: POSTED + 60 * 60_000,
		recentlyChatted: false,
		favorite: false,
		...overrides,
	};
}

export function discreetPostData(
	overrides: Partial<DiscreetPostData> = {},
): DiscreetPostData {
	return {
		id: 1,
		hosting: false,
		posted: POSTED,
		expiration: POSTED + 60 * 60_000,
		profileFields: {
			age: null,
			height: null,
			weight: null,
			position: null,
		},
		...overrides,
	};
}

export function photo(mediaId: number): RightNowPostMediaItem {
	return {
		type: "image_v1",
		data: {
			mediaId,
			thumbnailUrl: `https://cdns.grindr.com/rightnow/thumb/${mediaId}`,
			fullImageUrl: `https://cdns.grindr.com/rightnow/full/${mediaId}`,
			isNsfw: false,
			shouldBlur: false,
		},
	};
}
