import type {
	DiscreetPostData,
	PostData,
	RightNowPostMediaItem,
} from "#lib/model/right-now/feed.ts";

const POSTED = 1_710_000_000_000;
const EXPIRES = Date.UTC(2100, 0, 1);

export function postData(overrides: Partial<PostData> = {}): PostData {
	return {
		id: 1,
		profileId: 200,
		media: [],
		hosting: false,
		posted: POSTED,
		expiration: EXPIRES,
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
		expiration: EXPIRES,
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
