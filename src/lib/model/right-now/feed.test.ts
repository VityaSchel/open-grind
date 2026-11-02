import { afterEach, describe, expect, it, vi } from "vitest";

import { rightNowFeedResponseSchema } from "./feed";

afterEach(() => {
	vi.restoreAllMocks();
});

const media = {
	type: "image_v1",
	data: {
		contentType: "image/jpeg",
		fullImageUrl: "https://cdns.grindr.com/images/profile/1024x1024/abc",
		thumbnailUrl: "https://cdns.grindr.com/images/thumb/480x480/abc",
		isNsfw: false,
		isRejectAutomated: null,
		mediaId: 31,
		reason: null,
		shouldBlur: false,
		source: "RIGHT_NOW",
		state: "APPROVED",
	},
};

const post = {
	"@type": "RightNowFeedItemData$RightNowPostV3",
	id: 250,
	profileId: 858,
	mediaHash: "90d8e6708aa30ac1f2d8689bcd52c1ab420e62a5",
	displayName: "Ada",
	media: [media],
	onlineUntil: 1_793_274_240_000,
	text: "Here for coffee",
	distance: 781,
	hosting: false,
	posted: 1_793_273_414_675,
	expiration: 1_793_277_014_675,
	recentlyChatted: true,
	favorite: false,
	lat: 52.5,
	lon: 13.4,
	isOnPrep: false,
};

const lockedPost = {
	"@type": "RightNowFeedItemData$LockedPostV1",
	id: 251,
	profileId: 859,
	media: [],
	distance: 900,
	type: "xtra_post_v1",
	hosting: true,
	posted: 1_793_273_000_000,
	expiration: 1_793_276_600_000,
	recentlyChatted: false,
	favorite: false,
};

const discreetPost = {
	"@type": "RightNowFeedItemData$DiscreetRightNowPostV1",
	id: 253,
	media: [media],
	onlineUntil: 1_793_560_997_000,
	text: "Here for coffee",
	lat: 52.53,
	lon: 13.39,
	hosting: false,
	posted: 1_793_560_807_132,
	expiration: 1_793_564_407_132,
	profileFields: { age: 18, height: 123.0, weight: null, position: null },
};

const parse = (items: unknown[]) =>
	rightNowFeedResponseSchema.parse({ items, viewerCount: 0 });

describe("rightNowFeedResponseSchema", () => {
	it("parses every feed item type", () => {
		const { items } = parse([
			{ type: "right_now_post_v3", data: post },
			{ type: "locked_post_v1", data: lockedPost },
			{ type: "discreet_right_now_post_v1", data: discreetPost },
			{ type: "discreet_locked_post_v1", data: discreetPost },
			{
				type: "curated_post_v1",
				data: { "@type": "x", type: "tutorial_hosting_v1" },
			},
			{
				type: "upsell_insert_v1",
				data: { "@type": "x", type: "xtra_upsell_v1" },
			},
		]);

		expect(items.map((item) => item.type)).toEqual([
			"right_now_post_v3",
			"locked_post_v1",
			"discreet_right_now_post_v1",
			"discreet_locked_post_v1",
			"curated_post_v1",
			"upsell_insert_v1",
		]);
	});

	it("keeps the post fields a card renders", () => {
		const [item] = parse([{ type: "right_now_post_v3", data: post }]).items;

		expect(item).toMatchObject({
			type: "right_now_post_v3",
			data: {
				id: 250,
				profileId: 858,
				displayName: "Ada",
				text: "Here for coffee",
				distance: 781,
				hosting: false,
				favorite: false,
				recentlyChatted: true,
				media: [
					{
						type: "image_v1",
						data: {
							mediaId: 31,
							thumbnailUrl:
								"https://cdns.grindr.com/images/thumb/480x480/abc",
							shouldBlur: false,
							isNsfw: false,
						},
					},
				],
			},
		});
	});

	it("reads the locked post kind", () => {
		const [item] = parse([
			{ type: "locked_post_v1", data: lockedPost },
		]).items;

		expect(item?.type === "locked_post_v1" && item.data.type).toBe(
			"xtra_post_v1",
		);
	});

	it("keeps unset discreet profile fields as null", () => {
		const [item] = parse([
			{ type: "discreet_right_now_post_v1", data: discreetPost },
		]).items;

		expect(
			item?.type === "discreet_right_now_post_v1" &&
				item.data.profileFields,
		).toEqual({ age: 18, height: 123, weight: null, position: null });
	});

	it("drops an item of an unknown type and keeps the rest", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const { items } = parse([
			{ type: "story_post_v9", data: {} },
			{ type: "right_now_post_v3", data: post },
		]);

		expect(items.map((item) => item.type)).toEqual(["right_now_post_v3"]);
	});

	it("drops a media entry without image URLs and keeps the post", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const [item] = parse([
			{
				type: "right_now_post_v3",
				data: {
					...post,
					media: [{ type: "image_v1", data: {} }, media],
				},
			},
		]).items;

		expect(
			item?.type === "right_now_post_v3" && item.data.media,
		).toHaveLength(1);
	});

	it("reads an unknown locked post kind as null", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const [item] = parse([
			{
				type: "locked_post_v1",
				data: { ...lockedPost, type: "gold_post_v1" },
			},
		]).items;

		expect(item?.type === "locked_post_v1" && item.data.type).toBeNull();
	});

	it("rejects a post without its id", () => {
		const withoutId = Object.fromEntries(
			Object.entries(post).filter(([key]) => key !== "id"),
		);

		expect(
			rightNowFeedResponseSchema.safeParse({
				items: [{ type: "right_now_post_v3", data: withoutId }],
				viewerCount: 0,
			}).success,
		).toBe(false);
	});
});
