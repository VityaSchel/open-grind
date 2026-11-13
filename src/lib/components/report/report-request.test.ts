import { describe, expect, it } from "vitest";

import { buildReportRequest } from "./report-request";

describe("buildReportRequest", () => {
	it("sends the fixed spam body whatever the form holds", () => {
		expect(
			buildReportRequest({
				reason: "SPAM",
				comment: "typed then switched to spam",
				locations: ["ALBUM", "PROFILE_PHOTO"],
			}),
		).toEqual({ reason: "SPAM", comment: "", locations: ["CHAT_MESSAGE"] });
	});

	it("keeps the chosen reason, locations and trimmed details", () => {
		expect(
			buildReportRequest({
				reason: "IMPERSONATION",
				comment: "  pretending to be someone else  ",
				locations: ["PROFILE_PHOTO", "PROFILE_INFORMATION"],
			}),
		).toEqual({
			reason: "IMPERSONATION",
			comment: "pretending to be someone else",
			locations: ["PROFILE_PHOTO", "PROFILE_INFORMATION"],
		});
	});

	it("passes a chat-message report through with its preset location", () => {
		expect(
			buildReportRequest({
				reason: "HARASSMENT_BULLYING",
				comment: "abusive message",
				locations: ["CHAT_MESSAGE"],
			}),
		).toEqual({
			reason: "HARASSMENT_BULLYING",
			comment: "abusive message",
			locations: ["CHAT_MESSAGE"],
		});
	});

	it("sends wire enum values, not display labels", () => {
		const report = buildReportRequest({
			reason: "SERIOUS_IN_PERSON_INCIDENT",
			comment: "details",
			locations: ["RIGHT_NOW_TEXT"],
		});
		expect(report.reason).toBe("SERIOUS_IN_PERSON_INCIDENT");
		expect(report.locations).toEqual(["RIGHT_NOW_TEXT"]);
	});
});
