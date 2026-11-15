import { describe, expect, it } from "vitest";

import type { RightNowPostStatus } from "#lib/model/right-now/post.ts";
import {
	isAwaitingModeration,
	isLivePost,
	rejectionKeys,
	repostRequest,
	textRejectReasonLabel,
} from "./right-now-post-fields";
import {
	moderatedText,
	ownPost,
	postPhoto,
} from "./right-now-post-test-helpers";

describe("repostRequest", () => {
	it("repeats the text, photo, hosting and location", () => {
		expect(
			repostRequest(
				ownPost({
					activeText: "Hosting now",
					hosting: true,
					media: [postPhoto({ mediaId: 7 })],
					shareLocation: "DISTANCE_AND_MAP",
					locationRadius: 80,
				}),
			),
		).toEqual({
			text: "Hosting now",
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 80,
			media: [{ type: "image_v1", data: { id: 7 } }],
			hosting: true,
		});
	});

	it("repeats an empty join as an empty post", () => {
		expect(repostRequest(ownPost())).toEqual({
			shareLocation: "NONE",
			media: [],
			hosting: false,
		});
	});

	it("leaves out rejected text", () => {
		expect(
			repostRequest(
				ownPost({
					activeText: "Approved earlier",
					moderatedText: moderatedText({
						text: "Rejected later",
						textStatus: "MODERATION_FAILED",
					}),
				}),
			),
		).toEqual({
			text: "Approved earlier",
			shareLocation: "NONE",
			media: [],
			hosting: false,
		});
	});

	it.each(["REJECTED", "DELETED"] as const)(
		"leaves out a %s photo",
		(state) => {
			expect(
				repostRequest(ownPost({ media: [postPhoto({ state })] })).media,
			).toEqual([]);
		},
	);

	it("repeats text still waiting for moderation", () => {
		expect(
			repostRequest(ownPost({ moderatedText: moderatedText() })).text,
		).toBe("Here for coffee and a good chat");
	});
});

describe("isAwaitingModeration", () => {
	it.each([
		["nothing under review", ownPost(), false],
		[
			"text under review",
			ownPost({ moderatedText: moderatedText() }),
			true,
		],
		[
			"a photo under review",
			ownPost({ media: [postPhoto({ state: "PENDING" })] }),
			true,
		],
		[
			"deleted text that was under review",
			ownPost({ moderatedText: moderatedText({ deleted: true }) }),
			false,
		],
	])(
		"tells whether a post with %s awaits moderation",
		(_, post, awaiting) => {
			expect(isAwaitingModeration(post)).toBe(awaiting);
		},
	);
});

describe("rejectionKeys", () => {
	it("names each rejection by its text or photo", () => {
		expect(
			rejectionKeys(
				ownPost({
					moderatedText: moderatedText({
						id: 5,
						textStatus: "MODERATION_FAILED",
					}),
					media: [postPhoto({ mediaId: 9, state: "REJECTED" })],
				}),
			),
		).toEqual(["text-5", "photo-9"]);
		expect(
			rejectionKeys(
				ownPost({
					moderatedText: moderatedText({ textStatus: "ERROR" }),
				}),
			),
		).toEqual([]);
		expect(rejectionKeys(null)).toEqual([]);
	});
});

describe("textRejectReasonLabel", () => {
	it.each([
		["SPAM_DISRUPT", "Spam/disruption"],
		["SOL_SEX", "Solicitation of sex"],
		["UNDERAGE", "Content with minors"],
		["SOMETHING_NEW", "Other"],
	])("names the text rejection reason %s as %s", (reason, label) => {
		expect(textRejectReasonLabel({ reason })).toBe(label);
	});
});

describe("isLivePost", () => {
	it.each<[RightNowPostStatus, boolean]>([
		["ACTIVE", true],
		["HIDDEN", true],
		["AWAITING_PAYMENT", false],
		["EXPIRED", false],
	])("reads a %s post as live: %s", (postStatus, live) => {
		expect(isLivePost(ownPost({ postStatus }))).toBe(live);
	});
});
