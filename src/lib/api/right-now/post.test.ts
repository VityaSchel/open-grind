import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRestMock } = vi.hoisted(() => ({ fetchRestMock: vi.fn() }));

vi.mock("#lib/api/transport.ts", () => ({ fetchRest: fetchRestMock }));

import { ApiError } from "#lib/api/api-error.ts";
import {
	createRightNowPost,
	getActiveRightNowPost,
	getProfileRightNowPost,
	getRightNowPostEntitlements,
	NoFreeRightNowPostsError,
	RightNowPostAlreadyRunningError,
	RightNowSessionEndedError,
	setRightNowPostHidden,
	updateRightNowPost,
} from "#lib/api/right-now/post.ts";
import {
	joinedPost,
	unpaidPost,
} from "#lib/model/right-now/post-test-helpers.ts";
import { requestsOf, restResponse } from "#lib/test/rest-response.ts";
import type { RightNowPostRequest } from "#lib/model/right-now/post.ts";

const POST_ID = 254;

const joinBody: RightNowPostRequest = {
	shareLocation: "NONE",
	media: [],
	hosting: false,
};

function respondInTurn(...replies: { status?: number; body?: unknown }[]) {
	for (const reply of replies) {
		fetchRestMock.mockResolvedValueOnce(restResponse(reply));
	}
}

function errorBody(type: string) {
	return { status: 400, title: "Action not allowed at this time", type };
}

beforeEach(() => {
	fetchRestMock.mockReset();
});

describe("getRightNowPostEntitlements", () => {
	it("reads the post allowance", async () => {
		respondInTurn({ body: { type: "GRANTED", count: 2 } });

		await expect(getRightNowPostEntitlements()).resolves.toEqual({
			type: "GRANTED",
			count: 2,
		});
		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: "/v1/rightnow/entitlements/posts",
				method: "GET",
				body: undefined,
			},
		]);
	});
});

describe("getActiveRightNowPost", () => {
	it("reads the running post", async () => {
		respondInTurn({ body: { post: joinedPost } });

		const post = await getActiveRightNowPost();

		expect(post?.id).toBe(POST_ID);
		expect(requestsOf(fetchRestMock)[0]?.path).toBe(
			"/v3/rightnow/active-post",
		);
	});

	it("reads no post as null", async () => {
		respondInTurn({ body: { post: null } });

		await expect(getActiveRightNowPost()).resolves.toBeNull();
	});
});

describe("getProfileRightNowPost", () => {
	it("reads another profile's running post", async () => {
		respondInTurn({ body: { post: joinedPost } });

		const post = await getProfileRightNowPost({ profileId: 42 });

		expect(post?.id).toBe(POST_ID);
		expect(requestsOf(fetchRestMock)[0]?.path).toBe(
			"/v3/rightnow/profiles/42",
		);
	});

	it("reads a profile without a visible post as null", async () => {
		respondInTurn({ body: { post: null } });

		await expect(
			getProfileRightNowPost({ profileId: 42 }),
		).resolves.toBeNull();
	});
});

describe("createRightNowPost", () => {
	it("checks the allowance, then creates the post on v3", async () => {
		respondInTurn(
			{ body: { type: "GRANTED", count: 3 } },
			{ status: 201, body: { post: joinedPost } },
		);

		const post = await createRightNowPost({ post: joinBody });

		expect(post.id).toBe(POST_ID);
		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: "/v1/rightnow/entitlements/posts",
				method: "GET",
				body: undefined,
			},
			{ path: "/v3/rightnow/posts", method: "POST", body: joinBody },
		]);
	});

	it("creates with unlimited posts", async () => {
		respondInTurn(
			{ body: { type: "UNLIMITED" } },
			{ status: 201, body: { post: joinedPost } },
		);

		await createRightNowPost({ post: joinBody });

		expect(requestsOf(fetchRestMock).map(({ path }) => path)).toContain(
			"/v3/rightnow/posts",
		);
	});

	it("leaves an unknown allowance type to the server", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		respondInTurn(
			{ body: { type: "TRIAL", count: 5 } },
			{ status: 201, body: { post: joinedPost } },
		);

		await createRightNowPost({ post: joinBody });
		warn.mockRestore();

		expect(requestsOf(fetchRestMock).map(({ path }) => path)).toContain(
			"/v3/rightnow/posts",
		);
	});

	it("sends the post without coordinates", async () => {
		respondInTurn(
			{ body: { type: "GRANTED", count: 1 } },
			{ status: 201, body: { post: joinedPost } },
		);
		const post = {
			text: "Here for coffee",
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
			media: [{ type: "image_v1", data: { id: 322 } }],
			hosting: true,
			lat: 52.52,
			lon: 13.405,
		} as RightNowPostRequest;

		await createRightNowPost({ post });

		expect(requestsOf(fetchRestMock)[1]?.body).toEqual({
			text: "Here for coffee",
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 100,
			media: [{ type: "image_v1", data: { id: 322 } }],
			hosting: true,
		});
	});

	it.each([
		["a count of 0", { type: "GRANTED", count: 0 }],
		["no count", { type: "GRANTED" }],
	])("does not post with %s", async (_, entitlements) => {
		respondInTurn({ body: entitlements });

		await expect(createRightNowPost({ post: joinBody })).rejects.toThrow(
			NoFreeRightNowPostsError,
		);
		expect(requestsOf(fetchRestMock)).toHaveLength(1);
	});

	it("reads an unpaid post as no free posts left", async () => {
		respondInTurn(
			{ body: { type: "GRANTED", count: 1 } },
			{ status: 201, body: { post: unpaidPost } },
		);

		await expect(createRightNowPost({ post: joinBody })).rejects.toThrow(
			NoFreeRightNowPostsError,
		);
		expect(requestsOf(fetchRestMock)).toHaveLength(2);
	});

	it("reads a refused second post as one already running", async () => {
		respondInTurn(
			{ body: { type: "GRANTED", count: 2 } },
			{ status: 400, body: errorBody("urn:gr:err:client_action") },
		);

		await expect(createRightNowPost({ post: joinBody })).rejects.toThrow(
			RightNowPostAlreadyRunningError,
		);
	});

	it("passes other failures through", async () => {
		respondInTurn(
			{ body: { type: "GRANTED", count: 2 } },
			{ status: 400, body: errorBody("urn:gr:err:bad_request") },
		);

		await expect(createRightNowPost({ post: joinBody })).rejects.toThrow(
			ApiError,
		);
	});
});

describe("updateRightNowPost", () => {
	it("sends only the changed keys to v4", async () => {
		respondInTurn({ status: 204 });

		await updateRightNowPost({
			postId: POST_ID,
			changes: { text: "Here for coffee", hosting: true },
		});

		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: `/v4/rightnow/posts/${POST_ID}`,
				method: "PATCH",
				body: { text: "Here for coffee", hosting: true },
			},
		]);
	});

	it("removes the photo with an empty media list", async () => {
		respondInTurn({ status: 204 });

		await updateRightNowPost({ postId: POST_ID, changes: { media: [] } });

		expect(requestsOf(fetchRestMock)[0]?.body).toEqual({ media: [] });
	});

	it.each(["urn:gr:err:client_action", "urn:gr:err:resource_not_found"])(
		"reads %s on an edit as the session having ended",
		async (urn) => {
			respondInTurn({ status: 400, body: errorBody(urn) });

			await expect(
				updateRightNowPost({
					postId: POST_ID,
					changes: { hosting: true },
				}),
			).rejects.toThrow(RightNowSessionEndedError);
		},
	);

	it("passes other edit failures through", async () => {
		respondInTurn({
			status: 400,
			body: errorBody("urn:gr:err:bad_request"),
		});

		await expect(
			updateRightNowPost({ postId: POST_ID, changes: { hosting: true } }),
		).rejects.toThrow(ApiError);
	});
});

describe("setRightNowPostHidden", () => {
	it("sends the hidden flag to the v1 settings route", async () => {
		respondInTurn({ status: 204 });

		await setRightNowPostHidden({ postId: POST_ID, hidden: true });

		expect(requestsOf(fetchRestMock)).toEqual([
			{
				path: `/v1/rightnow/posts/${POST_ID}/settings`,
				method: "PATCH",
				body: { hidden: true },
			},
		]);
	});

	it.each(["urn:gr:err:client_action", "urn:gr:err:resource_not_found"])(
		"reads %s as the session having ended",
		async (urn) => {
			respondInTurn({ status: 400, body: errorBody(urn) });

			await expect(
				setRightNowPostHidden({ postId: POST_ID, hidden: false }),
			).rejects.toThrow(RightNowSessionEndedError);
		},
	);

	it("passes other failures through", async () => {
		respondInTurn({
			status: 400,
			body: errorBody("urn:gr:err:bad_request"),
		});

		await expect(
			setRightNowPostHidden({ postId: POST_ID, hidden: false }),
		).rejects.toThrow(ApiError);
	});
});
