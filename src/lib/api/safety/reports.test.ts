import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ZodType } from "zod";

const { fetchRestMock, callMethodMock, assignmentsOn } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	callMethodMock: vi.fn(),
	assignmentsOn: new Set<string>(),
}));

vi.mock("#lib/api/transport.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/transport.ts")>()),
	fetchRest: fetchRestMock,
}));
vi.mock("#lib/api/methods.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/api/methods.ts")>()),
	callMethod: callMethodMock,
}));
vi.mock("#lib/api/analytics/assignments.ts", () => ({
	isAssignmentOn: ({ key }: { key: string }) =>
		Promise.resolve(assignmentsOn.has(key)),
}));

import { ApiError } from "#lib/api/api-error.ts";
import {
	getProfileReport,
	getProfileReportV31,
	getProfileReportV4,
	getRightNowPostReport,
	reportProfile,
	reportProfileV31,
	reportProfileV4,
	reportProfileV5,
	reportRightNowPost,
} from "#lib/api/safety/reports.ts";
import type {
	ProfileReportRequest,
	RightNowPostReportRequest,
} from "#lib/model/safety/reports.ts";

const PROFILE_ID = 42;
const POST_ID = 7_001;
const CREATE_TIME = 1_789_000_000_000;

const report: ProfileReportRequest = {
	reason: "HARASSMENT_BULLYING",
	comment: "Keeps messaging after being told to stop",
	locations: ["CHAT_MESSAGE"],
};

const rightNowPostReport: RightNowPostReportRequest = {
	reason: "NUDITY_PORNOGRAPHY",
	comment: "Explicit photo in the post",
	locations: ["RIGHT_NOW_PHOTO", "RIGHT_NOW_TEXT"],
};

function response({
	status = 200,
	body = null,
}: { status?: number; body?: unknown } = {}) {
	const assertOk = () => {
		if (status < 200 || status >= 300)
			throw new ApiError({
				message: `API request failed with status ${status}`,
				request: { method: "POST", path: "/" },
				response: { status, body: "" },
			});
	};
	return {
		status,
		assertOk,
		jsonParsed: (schema: ZodType) => {
			assertOk();
			return schema.parse(body);
		},
	};
}

function respond(options: { status?: number; body?: unknown } = {}) {
	fetchRestMock.mockResolvedValue(response(options));
}

function respondInTurn(...statuses: number[]) {
	for (const status of statuses) {
		fetchRestMock.mockResolvedValueOnce(response({ status }));
	}
}

function requestedPaths() {
	return fetchRestMock.mock.calls.map(([path]) => path);
}

function onlyRequest() {
	expect(fetchRestMock).toHaveBeenCalledOnce();
	const [path, options] = fetchRestMock.mock.lastCall ?? [];
	return { path, options };
}

beforeEach(() => {
	fetchRestMock.mockReset();
	callMethodMock.mockReset();
	assignmentsOn.clear();
	respond();
});

describe("profile report reads", () => {
	const reads = [
		["/v3.1/flags/42", getProfileReportV31],
		["/v4/flags/42", getProfileReportV4],
	] as const;

	it.each(reads)("reads %s", async (path, read) => {
		respond({ body: { status: "PENDING", createTime: CREATE_TIME } });

		expect(await read({ profileId: PROFILE_ID })).toEqual({
			status: "PENDING",
			createTime: CREATE_TIME,
		});
		expect(onlyRequest()).toStrictEqual({ path, options: undefined });
	});

	it.each(reads)("reads a 404 from %s as not reported", async (_, read) => {
		respond({ status: 404 });

		expect(await read({ profileId: PROFILE_ID })).toBeNull();
	});

	it.each(reads)("throws any other failure from %s", async (_, read) => {
		respond({ status: 500 });

		await expect(read({ profileId: PROFILE_ID })).rejects.toThrow(
			"status 500",
		);
	});
});

describe("profile report submissions", () => {
	const submissions = [
		["/v3.1/flags/42", reportProfileV31],
		["/v4/flags/42", reportProfileV4],
		["/v5/flags/42", reportProfileV5],
	] as const;

	it.each(submissions)("posts the report to %s", async (path, submit) => {
		await submit({ profileId: PROFILE_ID, report });

		expect(onlyRequest()).toStrictEqual({
			path,
			options: { method: "POST", body: report },
		});
	});

	it.each(submissions)(
		"throws when %s rejects the report",
		async (_, submit) => {
			respond({ status: 403 });

			await expect(
				submit({ profileId: PROFILE_ID, report }),
			).rejects.toThrow("status 403");
		},
	);

	it("posts the captchaToken to v5", async () => {
		await reportProfileV5({
			profileId: PROFILE_ID,
			report: { ...report, captchaToken: "token" },
		});

		expect(onlyRequest().options.body).toStrictEqual({
			...report,
			captchaToken: "token",
		});
	});
});

describe("Right Now post reports", () => {
	it("reads the report on the post", async () => {
		respond({ body: { flagReport: { createTime: CREATE_TIME } } });

		expect(await getRightNowPostReport({ postId: POST_ID })).toEqual({
			status: null,
			createTime: CREATE_TIME,
		});
		expect(onlyRequest()).toStrictEqual({
			path: "/v1/flags/right-now/7001",
			options: undefined,
		});
	});

	it.each([
		["a 404", { status: 404 }],
		["a null flagReport", { body: { flagReport: null } }],
		["a missing flagReport", { body: {} }],
	])("reads %s as not reported", async (_, response) => {
		respond(response);

		expect(await getRightNowPostReport({ postId: POST_ID })).toBeNull();
	});

	it("throws any other failure", async () => {
		respond({ status: 500 });

		await expect(
			getRightNowPostReport({ postId: POST_ID }),
		).rejects.toThrow("status 500");
	});

	it("posts the report without asking for a token", async () => {
		assignmentsOn.add("right-now-moderation");

		await reportRightNowPost({
			postId: POST_ID,
			report: rightNowPostReport,
		});

		expect(onlyRequest()).toStrictEqual({
			path: "/v1/flags/right-now/7001",
			options: { method: "POST", body: rightNowPostReport },
		});
		expect(callMethodMock).not.toHaveBeenCalled();
	});
});

describe("getProfileReport", () => {
	it("reads v3.1 while right-now-moderation is off", async () => {
		assignmentsOn.add("some-other-flag");
		respond({ status: 404 });

		expect(await getProfileReport({ profileId: PROFILE_ID })).toBeNull();
		expect(onlyRequest().path).toBe("/v3.1/flags/42");
	});

	it("reads v4 while right-now-moderation is on", async () => {
		assignmentsOn.add("right-now-moderation");
		respond({ body: { status: "PENDING", createTime: CREATE_TIME } });

		expect(await getProfileReport({ profileId: PROFILE_ID })).toEqual({
			status: "PENDING",
			createTime: CREATE_TIME,
		});
		expect(onlyRequest().path).toBe("/v4/flags/42");
	});
});

describe("reportProfile", () => {
	it("posts to v3.1 without a token while right-now-moderation is off", async () => {
		await reportProfile({ profileId: PROFILE_ID, report });

		expect(onlyRequest()).toStrictEqual({
			path: "/v3.1/flags/42",
			options: { method: "POST", body: report },
		});
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	describe("while right-now-moderation is on", () => {
		beforeEach(() => {
			assignmentsOn.add("right-now-moderation");
		});

		it("posts to v5 with a report token", async () => {
			callMethodMock.mockResolvedValue("minted-token");

			await reportProfile({ profileId: PROFILE_ID, report });

			expect(callMethodMock).toHaveBeenCalledExactlyOnceWith(
				"mint_recaptcha_token",
				{ action: "report" },
			);
			expect(onlyRequest()).toStrictEqual({
				path: "/v5/flags/42",
				options: {
					method: "POST",
					body: { ...report, captchaToken: "minted-token" },
				},
			});
		});

		it("falls back to the ungated v3.1 when minting fails", async () => {
			callMethodMock.mockRejectedValue({
				kind: "Recaptcha",
				message: { reason: "unsupportedPlatform" },
			});

			await expect(
				reportProfile({ profileId: PROFILE_ID, report }),
			).resolves.toBeUndefined();

			expect(onlyRequest()).toStrictEqual({
				path: "/v3.1/flags/42",
				options: { method: "POST", body: report },
			});
		});

		describe("with a minted token", () => {
			beforeEach(() => {
				callMethodMock.mockResolvedValue("minted-token");
			});

			it.each([400, 403, 422])(
				"refiles on the ungated v3.1 without the token when v5 refuses it with %i",
				async (status) => {
					respondInTurn(status, 200);

					await expect(
						reportProfile({ profileId: PROFILE_ID, report }),
					).resolves.toBeUndefined();

					expect(requestedPaths()).toStrictEqual([
						"/v5/flags/42",
						"/v3.1/flags/42",
					]);
					expect(fetchRestMock.mock.lastCall).toStrictEqual([
						"/v3.1/flags/42",
						{ method: "POST", body: report },
					]);
				},
			);

			it("throws the v3.1 refusal when the fallback is refused too", async () => {
				respondInTurn(403, 409);

				await expect(
					reportProfile({ profileId: PROFILE_ID, report }),
				).rejects.toThrow("status 409");
				expect(requestedPaths()).toStrictEqual([
					"/v5/flags/42",
					"/v3.1/flags/42",
				]);
			});

			it("does not refile after a v5 server error, which may have filed it", async () => {
				respondInTurn(500);

				await expect(
					reportProfile({ profileId: PROFILE_ID, report }),
				).rejects.toThrow("status 500");
				expect(requestedPaths()).toStrictEqual(["/v5/flags/42"]);
			});

			it("does not refile when v5 never answered", async () => {
				fetchRestMock.mockRejectedValueOnce(
					new ApiError({
						message: "Network error",
						request: { method: "POST", path: "/v5/flags/42" },
					}),
				);

				await expect(
					reportProfile({ profileId: PROFILE_ID, report }),
				).rejects.toThrow("Network error");
				expect(requestedPaths()).toStrictEqual(["/v5/flags/42"]);
			});
		});
	});
});
