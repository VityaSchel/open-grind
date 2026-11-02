import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock, assignmentsOn, markOnlineRefreshedMock } = vi.hoisted(
	() => ({
		fetchRestMock: vi.fn(),
		assignmentsOn: new Set<string>(),
		markOnlineRefreshedMock: vi.fn(),
	}),
);

vi.mock("#lib/api/transport.ts", () => ({ fetchRest: fetchRestMock }));
vi.mock("#lib/api/analytics/assignments.ts", () => ({
	isAssignmentOn: ({ key }: { key: string }) =>
		Promise.resolve(assignmentsOn.has(key)),
}));
vi.mock("#lib/presence/online-clock.ts", () => ({
	markOnlineRefreshed: markOnlineRefreshedMock,
}));

const { getRightNowFeed, rightNowFeedVersion } = await import("./feed");

function requestedUrl() {
	return fetchRestMock.mock.calls[0]?.[0] as string;
}

function requestedParams() {
	const url = requestedUrl();
	return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

beforeEach(() => {
	assignmentsOn.clear();
	markOnlineRefreshedMock.mockReset();
	fetchRestMock.mockReset();
	fetchRestMock.mockResolvedValue({
		jsonParsed: () => ({ items: [], viewerCount: 0 }),
	});
});

describe("rightNowFeedVersion", () => {
	it("reads v4 without the discreet or explicit image assignments", async () => {
		expect(await rightNowFeedVersion()).toBe("v4");
	});

	it("reads v5 with discreet posting on", async () => {
		assignmentsOn.add("right-now-discreet");
		expect(await rightNowFeedVersion()).toBe("v5");
	});

	it("reads v6 with explicit images on, discreet posting or not", async () => {
		assignmentsOn.add("right-now-explicit-images");
		assignmentsOn.add("right-now-discreet");
		expect(await rightNowFeedVersion()).toBe("v6");
	});
});

describe("getRightNowFeed", () => {
	it("requests the chosen version with the query", async () => {
		await getRightNowFeed({
			version: "v5",
			query: {
				sort: "DISTANCE",
				hosting: false,
				ageMin: 20,
				ageMax: 40,
				sexualPositions: [1, -1],
			},
		});

		expect(requestedUrl().startsWith("/v5/rightnow/feed?")).toBe(true);
		expect(Object.fromEntries(requestedParams())).toEqual({
			sort: "DISTANCE",
			hosting: "false",
			ageMin: "20",
			ageMax: "40",
			sexualPositions: "1,-1",
		});
	});

	it("leaves out unset query fields", async () => {
		await getRightNowFeed({ version: "v4", query: { sort: "NEWEST" } });

		expect(Object.fromEntries(requestedParams())).toEqual({
			sort: "NEWEST",
		});
	});

	it("marks the caller online after the feed answers", async () => {
		await getRightNowFeed({ version: "v4", query: {} });

		expect(markOnlineRefreshedMock).toHaveBeenCalledOnce();
	});

	it("does not mark the caller online when the request fails", async () => {
		fetchRestMock.mockRejectedValue(new Error("offline"));

		await expect(
			getRightNowFeed({ version: "v4", query: {} }),
		).rejects.toThrow("offline");
		expect(markOnlineRefreshedMock).not.toHaveBeenCalled();
	});
});
