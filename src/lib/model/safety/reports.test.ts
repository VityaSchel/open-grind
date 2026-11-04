import { describe, expect, it } from "vitest";

import {
	profileReportRequestSchema,
	profileReportRequestV2Schema,
	rightNowPostReportRequestSchema,
	rightNowPostSubmittedReportResponseSchema,
	submittedReportSchema,
} from "#lib/model/safety/reports.ts";

const report = {
	reason: "IMPERSONATION",
	comment: "Uses someone else's photos",
	locations: ["PROFILE_PHOTO"],
};

describe("submittedReportSchema", () => {
	it.each([{}, { status: null, createTime: null }])(
		"reads %j as a report with nothing known about it",
		(body) => {
			expect(submittedReportSchema.parse(body)).toEqual({
				status: null,
				createTime: null,
			});
		},
	);

	it("still rejects a createTime that is not a timestamp", () => {
		expect(
			submittedReportSchema.safeParse({ createTime: "yesterday" })
				.success,
		).toBe(false);
	});
});

describe("rightNowPostSubmittedReportResponseSchema", () => {
	it.each([{}, { flagReport: null }])("reads %j as not reported", (body) => {
		expect(
			rightNowPostSubmittedReportResponseSchema.parse(body).flagReport,
		).toBeNull();
	});

	it("keeps the report it carries", () => {
		expect(
			rightNowPostSubmittedReportResponseSchema.parse({
				flagReport: {
					status: "PENDING",
					createTime: 1_700_000_000_000,
				},
			}).flagReport,
		).toEqual({ status: "PENDING", createTime: 1_700_000_000_000 });
	});
});

describe("report request schemas", () => {
	it("accept a full profile report", () => {
		const albumReport = {
			...report,
			locations: ["ALBUM"],
			albumInfo: { albumId: 900, contentId: 90_001, hasVideo: false },
			rightNowInfo: { postId: 77 },
		};

		expect(profileReportRequestSchema.parse(albumReport)).toEqual(
			albumReport,
		);
	});

	it.each([
		{ albumInfo: { albumId: 900, contentId: 90_001 } },
		{ albumInfo: {} },
		{ rightNowInfo: {} },
	])("accept the partial details the spec allows: %j", (details) => {
		const partialReport = { ...report, ...details };

		expect(profileReportRequestSchema.parse(partialReport)).toEqual(
			partialReport,
		);
	});

	it("take captchaToken only on the v2 profile report", () => {
		const withToken = { ...report, captchaToken: "token" };

		expect(profileReportRequestV2Schema.safeParse(withToken).success).toBe(
			true,
		);
		expect(profileReportRequestSchema.safeParse(withToken).success).toBe(
			false,
		);
		expect(
			rightNowPostReportRequestSchema.safeParse(withToken).success,
		).toBe(false);
	});

	it("reject album details the spec does not list", () => {
		expect(
			profileReportRequestSchema.safeParse({
				...report,
				albumInfo: {
					albumId: 900,
					contentId: 90_001,
					hasVideo: false,
					albumName: "Weekend trip",
				},
			}).success,
		).toBe(false);
	});

	it("reject Right Now details on a Right Now post report", () => {
		expect(
			rightNowPostReportRequestSchema.safeParse({
				...report,
				rightNowInfo: { postId: 77 },
			}).success,
		).toBe(false);
	});

	it("reject a reason the spec does not list", () => {
		expect(
			profileReportRequestSchema.safeParse({ ...report, reason: "RUDE" })
				.success,
		).toBe(false);
	});
});
