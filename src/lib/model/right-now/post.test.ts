import { afterEach, describe, expect, it, vi } from "vitest";

import {
	rightNowMediaUploadResponseSchema,
	rightNowPostRequestSchema,
	rightNowPostResponseSchema,
} from "./post";
import { joinedPost } from "./post-test-helpers";

afterEach(() => {
	vi.restoreAllMocks();
});

const photo = {
	contentType: "image/jpeg",
	fullImageUrl: "https://cdns.grindr.com/images/profile/1024x1024/abc",
	isNsfw: false,
	isRejectAutomated: true,
	mediaId: 316,
	reason: null,
	shouldBlur: false,
	source: "RIGHT_NOW",
	state: "APPROVED",
	thumbnailUrl: "https://cdns.grindr.com/images/thumb/480x480/abc",
};

const createdPost = {
	activeText: null,
	boostUpsellOfferAvailableUntil: null,
	expiration: 1_793_280_774_553,
	hosting: false,
	id: 250,
	isDiscreet: "NOT_SELECTED",
	lat: 52.52000003121793,
	locationRadius: 100,
	lon: 13.404999878257511,
	media: [photo],
	moderatedText: {
		createdAt: 1_793_277_174_559,
		deleted: false,
		id: 103,
		postId: 250,
		rejectReasons: [],
		text: "Here for coffee and a good chat",
		textStatus: "AWAITING_MODERATION",
		updatedAt: 1_793_277_174_559,
	},
	postStatus: "ACTIVE",
	posted: 1_793_277_174_553,
	profileId: 858,
	shareLocation: "DISTANCE_AND_MAP",
	sharedFields: [],
};

const parsePost = (post: unknown) =>
	rightNowPostResponseSchema.parse({ post }).post;

function omitKey({ value, key }: { value: object; key: string }) {
	return Object.fromEntries(
		Object.entries(value).filter(([entry]) => entry !== key),
	);
}

describe("rightNowPostResponseSchema", () => {
	it("reads a created post with a photo and text awaiting moderation", () => {
		expect(parsePost(createdPost)).toEqual({
			id: 250,
			profileId: 858,
			posted: 1_793_277_174_553,
			expiration: 1_793_280_774_553,
			hosting: false,
			activeText: null,
			moderatedText: {
				id: 103,
				postId: 250,
				text: "Here for coffee and a good chat",
				textStatus: "AWAITING_MODERATION",
				rejectReasons: [],
				createdAt: 1_793_277_174_559,
				updatedAt: 1_793_277_174_559,
				deleted: false,
			},
			media: [
				{
					mediaId: 316,
					thumbnailUrl: photo.thumbnailUrl,
					fullImageUrl: photo.fullImageUrl,
					state: "APPROVED",
					reason: null,
					shouldBlur: false,
					isNsfw: false,
				},
			],
			lat: 52.52000003121793,
			lon: 13.404999878257511,
			postStatus: "ACTIVE",
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
		});
	});

	it("reads an empty joined post", () => {
		expect(parsePost(joinedPost)).toMatchObject({
			activeText: null,
			moderatedText: null,
			media: [],
			lat: null,
			lon: null,
			postStatus: "ACTIVE",
			shareLocation: "NONE",
			locationRadius: 0,
		});
	});

	it("reads a hidden post that keeps its timer and text", () => {
		const post = parsePost({
			...joinedPost,
			activeText: "Here for coffee and a good chat",
			isDiscreet: "FALSE",
			postStatus: "HIDDEN",
		});

		expect(post?.postStatus).toBe("HIDDEN");
		expect(post?.expiration).toBe(1_793_701_817_246);
		expect(post?.activeText).toBe("Here for coffee and a good chat");
	});

	it("reads an unpaid post without posted or expiration times", () => {
		const post = parsePost({
			...createdPost,
			expiration: null,
			posted: null,
			postStatus: "AWAITING_PAYMENT",
		});

		expect(post).toMatchObject({
			postStatus: "AWAITING_PAYMENT",
			posted: null,
			expiration: null,
		});
	});

	it("reads no post", () => {
		expect(parsePost(null)).toBeNull();
	});

	it("reads rejected text with its reasons", () => {
		const post = parsePost({
			...createdPost,
			moderatedText: {
				...createdPost.moderatedText,
				textStatus: "MODERATION_FAILED",
				rejectReasons: ["SPAM_DISRUPT"],
			},
		});

		expect(post?.moderatedText).toMatchObject({
			textStatus: "MODERATION_FAILED",
			rejectReasons: ["SPAM_DISRUPT"],
		});
	});

	it("defaults missing or null reject reasons to an empty list", () => {
		const withoutReasons = omitKey({
			value: createdPost.moderatedText,
			key: "rejectReasons",
		});

		expect(
			parsePost({ ...createdPost, moderatedText: withoutReasons })
				?.moderatedText?.rejectReasons,
		).toEqual([]);
		expect(
			parsePost({
				...createdPost,
				moderatedText: { ...withoutReasons, rejectReasons: null },
			})?.moderatedText?.rejectReasons,
		).toEqual([]);
	});

	it("reads a null media list as no media", () => {
		expect(parsePost({ ...createdPost, media: null })?.media).toEqual([]);
	});

	it("reads unknown statuses as null", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const post = parsePost({
			...createdPost,
			postStatus: "BOOSTED",
			shareLocation: "EVERYWHERE",
			media: [{ ...photo, state: "QUARANTINED" }],
			moderatedText: {
				...createdPost.moderatedText,
				textStatus: "LATER",
			},
		});

		expect(post?.postStatus).toBeNull();
		expect(post?.shareLocation).toBeNull();
		expect(post?.media[0]?.state).toBeNull();
		expect(post?.moderatedText?.textStatus).toBeNull();
	});

	it("drops a photo without image URLs and keeps the post", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const withoutFullImage = omitKey({ value: photo, key: "fullImageUrl" });

		const post = parsePost({
			...createdPost,
			media: [withoutFullImage, { ...photo, mediaId: 317 }],
		});

		expect(post?.media.map(({ mediaId }) => mediaId)).toEqual([317]);
	});

	it("rejects a post without its id", () => {
		const withoutId = omitKey({ value: joinedPost, key: "id" });

		expect(() => parsePost(withoutId)).toThrow();
	});
});

describe("rightNowPostRequestSchema", () => {
	it("accepts the empty join body", () => {
		const body = { shareLocation: "NONE", media: [], hosting: false };

		expect(rightNowPostRequestSchema.parse(body)).toEqual(body);
	});

	it("keeps a photo reference and drops coordinates", () => {
		expect(
			rightNowPostRequestSchema.parse({
				text: "Here for coffee",
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 100,
				media: [{ type: "image_v1", data: { id: 322 } }],
				hosting: true,
				lat: 52.52,
				lon: 13.405,
			}),
		).toEqual({
			text: "Here for coffee",
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
			media: [{ type: "image_v1", data: { id: 322 } }],
			hosting: true,
		});
	});

	it("rejects a location radius outside 0 to 100", () => {
		expect(() =>
			rightNowPostRequestSchema.parse({
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 101,
				media: [],
				hosting: false,
			}),
		).toThrow();
	});
});

describe("rightNowMediaUploadResponseSchema", () => {
	it("reads an uploaded photo", () => {
		const body = {
			mediaId: 322,
			thumbnailUrl: "https://cdns.grindr.com/images/thumb/480x480/def",
			url: "https://cdns.grindr.com/images/profile/1024x1024/def",
		};

		expect(rightNowMediaUploadResponseSchema.parse(body)).toEqual(body);
	});
});
