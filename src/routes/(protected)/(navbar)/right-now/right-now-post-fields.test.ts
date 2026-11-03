import { describe, expect, it } from "vitest";

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

	it("leaves out rejected text and photos", () => {
		expect(
			repostRequest(
				ownPost({
					activeText: "Approved earlier",
					moderatedText: moderatedText({
						text: "Rejected later",
						textStatus: "MODERATION_FAILED",
					}),
					media: [postPhoto({ state: "REJECTED" })],
				}),
			),
		).toEqual({
			text: "Approved earlier",
			shareLocation: "NONE",
			media: [],
			hosting: false,
		});
	});

	it("repeats text still waiting for moderation", () => {
		expect(
			repostRequest(ownPost({ moderatedText: moderatedText() })).text,
		).toBe("Here for coffee and a good chat");
	});
});

describe("own post moderation", () => {
	it("waits while text or a photo is pending", () => {
		expect(isAwaitingModeration(ownPost())).toBe(false);
		expect(
			isAwaitingModeration(ownPost({ moderatedText: moderatedText() })),
		).toBe(true);
		expect(
			isAwaitingModeration(
				ownPost({ media: [postPhoto({ state: "PENDING" })] }),
			),
		).toBe(true);
		expect(
			isAwaitingModeration(
				ownPost({ moderatedText: moderatedText({ deleted: true }) }),
			),
		).toBe(false);
	});

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

	it.each([
		["SPAM_DISRUPT", "Spam/disruption"],
		["SOL_SEX", "Solicitation of sex"],
		["UNDERAGE", "Content with minors"],
		["SOMETHING_NEW", "Other"],
	])("names the text rejection reason %s as %s", (reason, label) => {
		expect(textRejectReasonLabel({ reason })).toBe(label);
	});

	it("treats an unpaid or expired post as no post", () => {
		expect(isLivePost(ownPost())).toBe(true);
		expect(isLivePost(ownPost({ postStatus: "HIDDEN" }))).toBe(true);
		expect(isLivePost(ownPost({ postStatus: "AWAITING_PAYMENT" }))).toBe(
			false,
		);
		expect(isLivePost(ownPost({ postStatus: "EXPIRED" }))).toBe(false);
	});
});
