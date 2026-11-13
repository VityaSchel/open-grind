import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock, showErrorToastMock, toastMock } = vi.hoisted(() => ({
	fetchRestMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	toastMock: Object.assign(vi.fn(), { error: vi.fn() }),
}));

vi.mock("#lib/api/transport.ts", () => ({ fetchRest: fetchRestMock }));
vi.mock("#lib/api/error-toast.ts", () => ({
	showErrorToast: showErrorToastMock,
}));
vi.mock("#lib/api/app-lifecycle.svelte.ts", () => ({
	appLifecycle: { active: true },
}));
vi.mock("#lib/app-data/preferences.svelte.ts", () => ({
	getPreferences: () => Promise.resolve({ geohash: null }),
}));
vi.mock("#lib/entitlements/honduras-hold.ts", () => ({
	atHomeLocation: (request: () => Promise<unknown>) => request(),
}));
vi.mock("#lib/grid/grid.ts", () => ({ storeLocation: vi.fn() }));
vi.mock("#lib/api/analytics/assignments.ts", () => ({
	isAssignmentOn: () => Promise.resolve(false),
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("./right-now-feed-state.svelte", () => ({
	getRightNowFeedState: () => ({ refreshOrDefer: () => Promise.resolve() }),
}));
import {
	joinedPost,
	unpaidPost,
} from "#lib/model/right-now/post-test-helpers.ts";
import { requestsOf, restResponse } from "#lib/test/rest-response.ts";
import {
	destroyCreatedStates,
	loadedState,
} from "./right-now-post-state-test-helpers";

function serve({
	entitlements,
	created = joinedPost,
}: {
	entitlements: unknown[];
	created?: unknown;
}) {
	const allowances = [...entitlements];
	fetchRestMock.mockImplementation((path: string) => {
		if (path === "/v1/rightnow/entitlements/posts") {
			const body =
				allowances.length > 1 ? allowances.shift() : allowances[0];
			return Promise.resolve(restResponse({ body }));
		}
		if (path === "/v3/rightnow/active-post")
			return Promise.resolve(restResponse({ body: { post: null } }));
		if (path === "/v3/rightnow/posts")
			return Promise.resolve(
				restResponse({ status: 201, body: { post: created } }),
			);
		return Promise.reject(new Error(`Unexpected request to ${path}`));
	});
}

function creates() {
	return requestsOf(fetchRestMock).filter(({ method }) => method === "POST");
}

beforeEach(() => {
	fetchRestMock.mockReset();
	showErrorToastMock.mockReset();
	toastMock.mockReset();
	toastMock.error.mockReset();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	destroyCreatedStates();
	vi.restoreAllMocks();
});

describe("RightNowPostState free posts", () => {
	it("joins with an empty post after reading the allowance again", async () => {
		serve({ entitlements: [{ type: "GRANTED", count: 2 }] });
		const state = await loadedState();
		fetchRestMock.mockClear();

		await expect(state.join()).resolves.toBe(true);

		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: "/v1/rightnow/entitlements/posts",
				method: "GET",
				body: undefined,
			},
			{
				path: "/v3/rightnow/posts",
				method: "POST",
				body: { shareLocation: "NONE", media: [], hosting: false },
			},
		]);
		expect(state.status).toBe("active");
		expect(state.freePostsLeft).toBe(1);
	});

	it("never creates a post once the allowance is used up", async () => {
		serve({
			entitlements: [
				{ type: "GRANTED", count: 1 },
				{ type: "GRANTED", count: 0 },
			],
		});
		const state = await loadedState();

		expect(state.freePostsLeft).toBe(1);
		await expect(state.join()).resolves.toBe(false);

		expect(creates()).toEqual([]);
		expect(state.freePostsLeft).toBe(0);
		expect(state.post).toBeNull();
		expect(toastMock.error).toHaveBeenCalledWith(
			"No free posts left in this area",
			expect.anything(),
		);
	});

	it("reads an unpayable post as no free posts left and never retries", async () => {
		serve({
			entitlements: [{ type: "GRANTED", count: 1 }],
			created: unpaidPost,
		});
		const state = await loadedState();

		await expect(state.join()).resolves.toBe(false);

		expect(creates()).toHaveLength(1);
		expect(state.post).toBeNull();
		expect(state.status).toBe("none");
		expect(state.freePostsLeft).toBe(0);
		expect(toastMock.error).toHaveBeenCalledWith(
			"No free posts left in this area",
			expect.anything(),
		);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});
});
