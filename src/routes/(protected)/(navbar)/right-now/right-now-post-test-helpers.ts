import type { RightNowPostDetails } from "#lib/model/right-now/post.ts";

type ModeratedText = NonNullable<RightNowPostDetails["moderatedText"]>;
type PostMedia = RightNowPostDetails["media"][number];

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const POST_ID = 254;
export const POSTED = Date.now() - MINUTE;
export const EXPIRATION = POSTED + 60 * MINUTE;

export function ownPost(
	overrides: Partial<RightNowPostDetails> = {},
): RightNowPostDetails {
	return {
		id: POST_ID,
		profileId: 858,
		posted: POSTED,
		expiration: EXPIRATION,
		hosting: false,
		activeText: null,
		moderatedText: null,
		media: [],
		lat: null,
		lon: null,
		postStatus: "ACTIVE",
		shareLocation: "NONE",
		locationRadius: 0,
		...overrides,
	};
}

export function moderatedText(
	overrides: Partial<ModeratedText> = {},
): ModeratedText {
	return {
		id: 103,
		postId: POST_ID,
		text: "Here for coffee and a good chat",
		textStatus: "AWAITING_MODERATION",
		rejectReasons: [],
		createdAt: POSTED,
		updatedAt: POSTED,
		deleted: false,
		...overrides,
	};
}

export function postPhoto(overrides: Partial<PostMedia> = {}): PostMedia {
	return {
		mediaId: 316,
		thumbnailUrl: "https://cdns.grindr.com/images/thumb/480x480/a2bae94c",
		fullImageUrl:
			"https://cdns.grindr.com/images/profile/1024x1024/a2bae94c",
		state: "APPROVED",
		reason: null,
		shouldBlur: false,
		isNsfw: false,
		...overrides,
	};
}
