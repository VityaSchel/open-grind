import { describe, expect, it } from "vitest";

import { demoRoute } from "$lib/demo";
import { assignmentsResponseSchema } from "$lib/model/analytics/assignments";
import {
	rightNowPostSubmittedReportResponseSchema,
	submittedReportSchema,
} from "$lib/model/safety/reports";

const spamReport = { reason: "SPAM", comment: "", locations: ["CHAT_MESSAGE"] };

const read = (path: string) =>
	demoRoute({ path, method: "GET", body: undefined });

const submit = (path: string, body: unknown) =>
	demoRoute({ path, method: "POST", body });

const profileReportAt = (path: string) => {
	const { status, body } = read(path);
	return status === 404 ? null : submittedReportSchema.parse(body);
};

const rightNowPostReportOf = (postId: number) => {
	const { status, body } = read(`/v1/flags/right-now/${postId}`);
	return status === 404
		? null
		: rightNowPostSubmittedReportResponseSchema.parse(body).flagReport;
};

describe("demo reports", () => {
	it("answers a profile report on both read versions once it is submitted", () => {
		expect(profileReportAt("/v3.1/flags/100003")).toBeNull();
		expect(profileReportAt("/v4/flags/100003")).toBeNull();

		submit("/v3.1/flags/100003", spamReport);

		expect(profileReportAt("/v3.1/flags/100003")?.createTime).toEqual(
			expect.any(Number),
		);
		expect(profileReportAt("/v4/flags/100003")?.createTime).toEqual(
			expect.any(Number),
		);
		expect(profileReportAt("/v3.1/flags/100004")).toBeNull();
	});

	it("records a v5 report that carries a captchaToken", () => {
		submit("/v5/flags/100005", {
			...spamReport,
			captchaToken: "demo-recaptcha-token",
		});

		expect(profileReportAt("/v4/flags/100005")?.createTime).toEqual(
			expect.any(Number),
		);
	});

	it.each([
		[
			"/v3.1/flags/100006",
			"/v3.1/flags/100006",
			{ ...spamReport, captchaToken: "demo-recaptcha-token" },
		],
		[
			"/v5/flags/100007",
			"/v4/flags/100007",
			{ ...spamReport, reason: "RUDE" },
		],
		[
			"/v1/flags/right-now/8",
			"/v1/flags/right-now/8",
			{ ...spamReport, rightNowInfo: { postId: 8 } },
		],
	])(
		"rejects a report to %s whose body is not the documented shape",
		(submitPath, readPath, body) => {
			expect(() => submit(submitPath, body)).toThrow();
			expect(read(readPath).status).toBe(404);
		},
	);

	it("answers a Right Now post report once it is submitted", () => {
		expect(rightNowPostReportOf(7)).toBeNull();

		submit("/v1/flags/right-now/7", {
			reason: "NUDITY_PORNOGRAPHY",
			comment: "Explicit photo in the post",
			locations: ["RIGHT_NOW_PHOTO", "RIGHT_NOW_TEXT"],
		});

		expect(rightNowPostReportOf(7)?.createTime).toEqual(expect.any(Number));
		expect(read("/v1/flags/right-now/9").status).toBe(404);
	});

	it("turns right-now-moderation on", () => {
		const { assignments } = assignmentsResponseSchema.parse(
			read("/v3/assignment?geohash=u33dc0cppjs7").body,
		);

		expect(assignments).toContainEqual(
			expect.objectContaining({
				key: "right-now-moderation",
				value: "on",
			}),
		);
	});
});
