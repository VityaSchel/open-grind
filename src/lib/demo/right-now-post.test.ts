import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { demoMeProfileId, HOUR, MINUTE, SECOND } from "#lib/demo/config.ts";
import { rightNowFeedResponseSchema } from "#lib/model/right-now/feed.ts";
import {
	freeRightNowPostsLeft,
	type RightNowPostChanges,
	rightNowPostEntitlementsResponseSchema,
	type RightNowPostRequest,
	rightNowPostResponseSchema,
} from "#lib/model/right-now/post.ts";

const START = Date.parse("2026-11-03T12:00:00Z");

const joinBody: RightNowPostRequest = {
	shareLocation: "NONE",
	media: [],
	hosting: false,
};

let demo: typeof import("#lib/demo/index.ts");

function route({
	path,
	method = "GET",
	body,
}: {
	path: string;
	method?: string;
	body?: unknown;
}) {
	return demo.demoRoute({ path, method, body });
}

function activePost() {
	const { body } = route({ path: "/v3/rightnow/active-post" });
	return rightNowPostResponseSchema.parse(body).post;
}

function freePostsLeft() {
	const { body } = route({ path: "/v1/rightnow/entitlements/posts" });
	return freeRightNowPostsLeft(
		rightNowPostEntitlementsResponseSchema.parse(body),
	);
}

function create({ post = joinBody }: { post?: RightNowPostRequest } = {}) {
	return route({ path: "/v3/rightnow/posts", method: "POST", body: post });
}

function createdPost(options: { post?: RightNowPostRequest } = {}) {
	const { status, body } = create(options);
	expect(status).toBe(201);
	const { post } = rightNowPostResponseSchema.parse(body);
	if (post === null) throw new Error("The demo created no post");
	return post;
}

function edit({
	postId,
	changes,
}: {
	postId: number;
	changes: RightNowPostChanges;
}) {
	return route({
		path: `/v4/rightnow/posts/${postId}`,
		method: "PATCH",
		body: changes,
	});
}

function setHidden({ postId, hidden }: { postId: number; hidden: boolean }) {
	return route({
		path: `/v1/rightnow/posts/${postId}/settings`,
		method: "PATCH",
		body: { hidden },
	});
}

function feedPosts() {
	const { body } = route({ path: "/v6/rightnow/feed" });
	return rightNowFeedResponseSchema
		.parse(body)
		.items.flatMap((item) => ("hosting" in item.data ? [item.data] : []));
}

function ownFeedPosts() {
	return feedPosts().filter(
		(post) => "profileId" in post && post.profileId === demoMeProfileId,
	);
}

function advance(ms: number) {
	vi.setSystemTime(Date.now() + ms);
}

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(START);
	vi.resetModules();
	demo = await import("#lib/demo/index.ts");
});

afterEach(() => {
	vi.useRealTimers();
});

describe("demo right now own post", () => {
	it("starts with three free posts and no post, and each join spends one", () => {
		expect(freePostsLeft()).toBe(3);
		expect(activePost()).toBeNull();

		const post = createdPost();

		expect(post).toMatchObject({
			profileId: demoMeProfileId,
			postStatus: "ACTIVE",
			posted: START,
			expiration: START + HOUR,
			activeText: null,
			moderatedText: null,
			media: [],
			shareLocation: "NONE",
			locationRadius: 0,
		});
		expect(freePostsLeft()).toBe(2);
		expect(activePost()).toEqual(post);
	});

	it("answers a create at zero free posts with an unpayable post it does not keep", () => {
		for (let round = 0; round < 3; round++) {
			createdPost();
			advance(HOUR);
		}
		expect(freePostsLeft()).toBe(0);

		const { status, body } = create();

		expect(status).toBe(201);
		expect(rightNowPostResponseSchema.parse(body).post).toMatchObject({
			postStatus: "AWAITING_PAYMENT",
			posted: null,
			expiration: null,
		});
		expect(activePost()).toBeNull();
		expect(freePostsLeft()).toBe(0);
	});

	it("refuses a second create while a post runs, even hidden, without spending a free post", () => {
		const { id } = createdPost();

		const second = create();
		expect(second.status).toBe(400);
		expect(second.body).toMatchObject({
			status: 400,
			type: "urn:gr:err:client_action",
		});

		expect(setHidden({ postId: id, hidden: true }).status).toBe(204);
		expect(create().status).toBe(400);
		expect(freePostsLeft()).toBe(2);
	});

	it("hides and shows the post on the same timer, listing it in the feed only while active", () => {
		const { id, expiration } = createdPost();
		expect(ownFeedPosts().map((post) => post.id)).toEqual([id]);

		expect(setHidden({ postId: id, hidden: true }).status).toBe(204);
		expect(activePost()).toMatchObject({
			postStatus: "HIDDEN",
			expiration,
		});
		expect(ownFeedPosts()).toEqual([]);

		advance(10 * MINUTE);
		expect(setHidden({ postId: id, hidden: false }).status).toBe(204);
		expect(activePost()).toMatchObject({
			postStatus: "ACTIVE",
			expiration,
		});
		expect(ownFeedPosts().map((post) => post.id)).toEqual([id]);
	});

	it("moderates joined text for ten seconds and puts edited text live at once", () => {
		const { id } = createdPost({
			post: { ...joinBody, text: "Here for coffee", hosting: true },
		});
		expect(activePost()).toMatchObject({
			activeText: null,
			moderatedText: {
				text: "Here for coffee",
				textStatus: "AWAITING_MODERATION",
			},
		});
		expect(ownFeedPosts()[0]?.text).toBeUndefined();

		advance(10 * SECOND);
		expect(activePost()).toMatchObject({
			activeText: "Here for coffee",
			moderatedText: null,
		});

		const photo = demo.demoUploadRightNowPhoto({
			url: "https://picsum.photos/seed/own-post/600/800",
		});
		const changes: RightNowPostChanges = {
			text: "Door's open",
			media: [{ type: "image_v1", data: { id: photo.mediaId } }],
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 40,
		};
		expect(edit({ postId: id, changes }).status).toBe(204);
		expect(activePost()).toMatchObject({
			activeText: "Door's open",
			moderatedText: null,
			hosting: true,
			media: [
				{
					mediaId: photo.mediaId,
					fullImageUrl: photo.url,
					state: "APPROVED",
				},
			],
			shareLocation: "DISTANCE_AND_MAP",
			locationRadius: 40,
		});

		expect(edit({ postId: id, changes: { media: [] } }).status).toBe(204);
		expect(activePost()).toMatchObject({
			activeText: "Door's open",
			media: [],
			locationRadius: 40,
		});
		expect(ownFeedPosts()[0]).toMatchObject({
			text: "Door's open",
			hosting: true,
			media: [],
		});
	});

	it("ends the post an hour after it was posted", () => {
		const { id } = createdPost();

		advance(HOUR - 1);
		expect(activePost()?.id).toBe(id);

		advance(1);
		expect(activePost()).toBeNull();
		expect(ownFeedPosts()).toEqual([]);

		const unhidden = setHidden({ postId: id, hidden: false });
		const edited = edit({ postId: id, changes: { hosting: true } });
		expect(unhidden.body).toMatchObject({
			type: "urn:gr:err:client_action",
		});
		expect(edited.body).toMatchObject({ type: "urn:gr:err:client_action" });
		expect(createdPost().id).not.toBe(id);
		expect(freePostsLeft()).toBe(1);
	});

	it("refuses edits and settings for a post id it does not know", () => {
		const { id } = createdPost();

		const edited = edit({ postId: id + 1, changes: { hosting: true } });
		const hidden = setHidden({ postId: id + 1, hidden: true });
		expect(edited.body).toMatchObject({
			type: "urn:gr:err:resource_not_found",
		});
		expect(hidden.body).toMatchObject({
			type: "urn:gr:err:resource_not_found",
		});
		expect(activePost()).toMatchObject({ id, postStatus: "ACTIVE" });
	});

	it("places the own post among the newest posts by when it was posted, without a distance", () => {
		vi.setSystemTime(START - 30 * MINUTE);
		const { id, posted } = createdPost();

		const posts = feedPosts();
		const postedTimes = posts.map((post) => post.posted);
		const ownIndex = posts.findIndex((post) => post.id === id);

		expect(postedTimes).toEqual(postedTimes.toSorted((a, b) => b - a));
		expect(ownIndex).toBeGreaterThan(0);
		expect(ownIndex).toBeLessThan(posts.length - 1);
		expect(posts[ownIndex]).toMatchObject({
			profileId: demoMeProfileId,
			posted,
		});
		expect(posts[ownIndex]?.distance).toBeUndefined();
	});
});
