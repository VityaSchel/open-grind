import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getRightNowPostReportMock, toastMock, showErrorToastMock } = vi.hoisted(
	() => ({
		getRightNowPostReportMock:
			vi.fn<
				(target: {
					postId: number;
					profileId: number | null;
				}) => Promise<SubmittedReport | null>
			>(),
		toastMock: vi.fn(),
		showErrorToastMock: vi.fn(),
	}),
);

vi.mock("#lib/api/safety/reports.ts", () => ({
	getRightNowPostReport: getRightNowPostReportMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));

import type { SubmittedReport } from "#lib/model/safety/reports.ts";
import { RightNowPostReportState } from "./right-now-post-report-state.svelte";

beforeEach(() => {
	vi.clearAllMocks();
	getRightNowPostReportMock.mockResolvedValue(null);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("RightNowPostReportState", () => {
	it("opens the report about the post once no earlier report turns up, running beforeOpen first", async () => {
		const report = new RightNowPostReportState();
		const seen: boolean[] = [];

		await report.request({
			postId: 1,
			profileId: 201,
			beforeOpen: () => seen.push(report.open),
		});

		expect(getRightNowPostReportMock).toHaveBeenCalledExactlyOnceWith({
			postId: 1,
			profileId: 201,
		});
		expect(seen).toEqual([false]);
		expect(report.open).toBe(true);
		expect(report.target).toStrictEqual({
			kind: "rightNowPost",
			postId: 1,
			profileId: 201,
		});
	});

	it.each([
		{
			status: "PENDING" as const,
			createTime: Date.now() - 5 * 60_000,
			description: "5 mins · Awaiting moderation",
		},
		{ status: null, createTime: null, description: "Awaiting moderation" },
	])(
		"says an earlier report awaits moderation instead of opening: $description",
		async ({ status, createTime, description }) => {
			getRightNowPostReportMock.mockResolvedValue({ status, createTime });
			const report = new RightNowPostReportState();
			const beforeOpen = vi.fn();

			await report.request({ postId: 1, profileId: 201, beforeOpen });

			expect(toastMock).toHaveBeenCalledExactlyOnceWith(
				"Already reported",
				{ description },
			);
			expect(beforeOpen).not.toHaveBeenCalled();
			expect(report.open).toBe(false);
			expect(report.target).toBeNull();
		},
	);

	it("reports a failed check and stays closed", async () => {
		const error = new Error("offline");
		getRightNowPostReportMock.mockRejectedValue(error);
		const report = new RightNowPostReportState();
		const beforeOpen = vi.fn();

		await report.request({ postId: 1, profileId: 201, beforeOpen });

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to check for an earlier report",
			error,
		});
		expect(beforeOpen).not.toHaveBeenCalled();
		expect(report.open).toBe(false);
		expect(report.target).toBeNull();
	});

	it.each<{ overtaken: string; earlier: SubmittedReport | null }>([
		{ overtaken: "no earlier report", earlier: null },
		{
			overtaken: "an earlier report",
			earlier: { status: "PENDING", createTime: null },
		},
	])(
		"acts only on the latest of two overlapping requests when the overtaken check finds $overtaken",
		async ({ earlier }) => {
			const first = Promise.withResolvers<SubmittedReport | null>();
			const second = Promise.withResolvers<SubmittedReport | null>();
			getRightNowPostReportMock
				.mockReturnValueOnce(first.promise)
				.mockReturnValueOnce(second.promise);
			const report = new RightNowPostReportState();
			const beforeOpen = vi.fn();
			const firstRequest = report.request({
				postId: 1,
				profileId: 201,
				beforeOpen,
			});
			const secondRequest = report.request({
				postId: 3,
				profileId: null,
			});

			first.resolve(earlier);
			await firstRequest;

			expect(beforeOpen).not.toHaveBeenCalled();
			expect(toastMock).not.toHaveBeenCalled();
			expect(report.open).toBe(false);
			expect(report.target).toBeNull();

			second.resolve(null);
			await secondRequest;

			expect(report.open).toBe(true);
			expect(report.target).toStrictEqual({
				kind: "rightNowPost",
				postId: 3,
				profileId: null,
			});
		},
	);

	it("shows no error for a failed check that a later request overtook", async () => {
		const first = Promise.withResolvers<SubmittedReport | null>();
		getRightNowPostReportMock
			.mockReturnValueOnce(first.promise)
			.mockResolvedValueOnce(null);
		const report = new RightNowPostReportState();
		const firstRequest = report.request({ postId: 1, profileId: 201 });
		await report.request({ postId: 3, profileId: null });

		first.reject(new Error("offline"));
		await firstRequest;

		expect(showErrorToastMock).not.toHaveBeenCalled();
		expect(report.target).toStrictEqual({
			kind: "rightNowPost",
			postId: 3,
			profileId: null,
		});
	});
});
