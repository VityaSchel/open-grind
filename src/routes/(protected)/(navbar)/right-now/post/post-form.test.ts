import { describe, expect, it } from "vitest";

import type { RightNowOwnPostMedia } from "#lib/model/right-now/post.ts";
import {
	moderatedText,
	ownPost,
	postPhoto,
} from "../right-now-post-test-helpers";
import {
	approximateRadiusMeters,
	normalizePostText,
	postChangesOf,
	type PostForm,
	postFormOf,
	shareLocationFor,
	showsOnMap,
	singleLinePostText,
} from "./post-form";

const THUMB = "https://cdns.grindr.com/rightnow/thumb/51";

function media(state: RightNowOwnPostMedia["state"]): RightNowOwnPostMedia {
	return postPhoto({ mediaId: 51, thumbnailUrl: THUMB, state });
}

const joined: PostForm = {
	text: "",
	photo: null,
	hosting: false,
	shareLocation: "NONE",
	locationRadius: 100,
};

describe("post text", () => {
	it("turns every kind of newline into a space", () => {
		expect(singleLinePostText({ text: "a\nb\r\nc\rd" })).toBe("a b c d");
	});

	it("trims the text it sends", () => {
		expect(normalizePostText({ text: "  coffee?\n" })).toBe("coffee?");
	});
});

describe("approximateRadiusMeters", () => {
	it.each([
		[0, 100],
		[50, 1050],
		[100, 2000],
	])("puts radius %i at about %i meters", (locationRadius, meters) => {
		expect(approximateRadiusMeters({ locationRadius })).toBe(meters);
	});
});

describe("postFormOf", () => {
	it("reads the empty join post as an empty form with the least precise radius", () => {
		expect(postFormOf({ post: ownPost() })).toEqual(joined);
	});

	it("prefers the text under review over the live text", () => {
		const post = ownPost({
			activeText: "Old",
			moderatedText: moderatedText({ text: "New" }),
		});

		expect(postFormOf({ post }).text).toBe("New");
	});

	it("falls back to the live text when the reviewed text was deleted", () => {
		const post = ownPost({
			activeText: "Live",
			moderatedText: moderatedText({
				text: "Gone",
				textStatus: "MODERATION_FAILED",
				rejectReasons: ["SPAM_DISRUPT"],
				deleted: true,
			}),
		});

		expect(postFormOf({ post }).text).toBe("Live");
	});

	it("keeps the photo unless it was deleted", () => {
		expect(
			postFormOf({ post: ownPost({ media: [media("PENDING")] }) }).photo,
		).toEqual({ mediaId: 51, thumbnailUrl: THUMB });
		expect(
			postFormOf({ post: ownPost({ media: [media("DELETED")] }) }).photo,
		).toBeNull();
	});

	it("keeps the post's location sharing and its radius only while it is on the map", () => {
		const onMap = postFormOf({
			post: ownPost({
				shareLocation: "DISTANCE_AND_MAP",
				locationRadius: 40,
			}),
		});
		const distanceOnly = postFormOf({
			post: ownPost({
				shareLocation: "DISTANCE_ONLY",
				locationRadius: 40,
			}),
		});

		expect(onMap).toMatchObject({
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 40,
		});
		expect(showsOnMap(onMap)).toBe(true);
		expect(distanceOnly).toMatchObject({
			shareLocation: "DISTANCE_ONLY",
			locationRadius: 100,
		});
		expect(showsOnMap(distanceOnly)).toBe(false);
	});
});

describe("postChangesOf", () => {
	it("sends nothing when nothing changed", () => {
		expect(postChangesOf({ initial: joined, current: joined })).toEqual({});
	});

	it("sends only the changed keys", () => {
		expect(
			postChangesOf({
				initial: joined,
				current: { ...joined, text: " Coffee?\n", hosting: true },
			}),
		).toEqual({ text: "Coffee?", hosting: true });
	});

	it("ignores whitespace-only edits to the text", () => {
		const initial = { ...joined, text: "Coffee?" };

		expect(
			postChangesOf({
				initial,
				current: { ...initial, text: "Coffee? " },
			}),
		).toEqual({});
	});

	it("sends an empty text when the text is cleared", () => {
		const initial = { ...joined, text: "Coffee?" };

		expect(
			postChangesOf({ initial, current: { ...initial, text: "  " } }),
		).toEqual({ text: "" });
	});

	it("sends the new photo by id and an empty list when it is removed", () => {
		const withPhoto = {
			...joined,
			photo: { mediaId: 51, thumbnailUrl: THUMB },
		};

		expect(postChangesOf({ initial: joined, current: withPhoto })).toEqual({
			media: [{ type: "image_v1", data: { id: 51 } }],
		});
		expect(postChangesOf({ initial: withPhoto, current: joined })).toEqual({
			media: [],
		});
	});

	it("shares the map with the chosen radius when switched on", () => {
		expect(
			postChangesOf({
				initial: joined,
				current: {
					...joined,
					shareLocation: shareLocationFor({ showOnMap: true }),
					locationRadius: 100,
				},
			}),
		).toEqual({ shareLocation: "DISTANCE_AND_MAP", locationRadius: 100 });
	});

	it("sends only the radius when it moves while on the map", () => {
		const onMap: PostForm = {
			...joined,
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
		};

		expect(
			postChangesOf({
				initial: onMap,
				current: { ...onMap, locationRadius: 20 },
			}),
		).toEqual({ locationRadius: 20 });
	});

	it("stops sharing the location without a radius when switched off", () => {
		const onMap: PostForm = {
			...joined,
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 30,
		};

		expect(
			postChangesOf({
				initial: onMap,
				current: {
					...onMap,
					shareLocation: shareLocationFor({ showOnMap: false }),
				},
			}),
		).toEqual({ shareLocation: "NONE" });
	});

	it("keeps a distance-only post untouched until the map switch is used, then stops sharing", () => {
		const distanceOnly: PostForm = {
			...joined,
			shareLocation: "DISTANCE_ONLY",
		};

		expect(
			postChangesOf({ initial: distanceOnly, current: distanceOnly }),
		).toEqual({});
		expect(
			postChangesOf({
				initial: distanceOnly,
				current: {
					...distanceOnly,
					shareLocation: shareLocationFor({ showOnMap: false }),
				},
			}),
		).toEqual({ shareLocation: "NONE" });
	});
});
