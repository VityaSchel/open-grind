import z from "zod";

import { errorUrnFromBody } from "#lib/api/error-urn.ts";
import { fetchRest } from "#lib/api/transport.ts";
import {
	freeRightNowPostsLeft,
	type RightNowPostChanges,
	rightNowPostChangesSchema,
	type RightNowPostDetails,
	rightNowPostDetailsSchema,
	rightNowPostEntitlementsResponseSchema,
	type RightNowPostRequest,
	rightNowPostRequestSchema,
	rightNowPostResponseSchema,
} from "#lib/model/right-now/post.ts";

export class NoFreeRightNowPostsError extends Error {
	constructor() {
		super("No free Right Now posts are left in this area");
		this.name = "NoFreeRightNowPostsError";
	}
}

export class RightNowPostAlreadyRunningError extends Error {
	constructor() {
		super("A Right Now post is already running");
		this.name = "RightNowPostAlreadyRunningError";
	}
}

export class RightNowSessionEndedError extends Error {
	constructor() {
		super("The Right Now session has ended");
		this.name = "RightNowSessionEndedError";
	}
}

const createdPostResponseSchema = z.object({ post: rightNowPostDetailsSchema });

const sessionEndedUrns = new Set([
	"urn:gr:err:client_action",
	"urn:gr:err:resource_not_found",
]);

export async function getRightNowPostEntitlements() {
	return await fetchRest("/v1/rightnow/entitlements/posts").then((res) =>
		res.jsonParsed(rightNowPostEntitlementsResponseSchema),
	);
}

export async function getActiveRightNowPost() {
	const { post } = await fetchRest("/v3/rightnow/active-post").then((res) =>
		res.jsonParsed(rightNowPostResponseSchema),
	);
	return post;
}

export async function createRightNowPost({
	post,
}: {
	post: RightNowPostRequest;
}): Promise<RightNowPostDetails> {
	const entitlements = await getRightNowPostEntitlements();
	if (freeRightNowPostsLeft(entitlements) === 0) {
		throw new NoFreeRightNowPostsError();
	}
	const res = await fetchRest("/v3/rightnow/posts", {
		method: "POST",
		body: rightNowPostRequestSchema.parse(post),
	});
	if (
		res.status === 400 &&
		errorUrnFromBody(res.text()) === "urn:gr:err:client_action"
	) {
		throw new RightNowPostAlreadyRunningError();
	}
	const { post: created } = res.jsonParsed(createdPostResponseSchema);
	if (created.postStatus === "AWAITING_PAYMENT") {
		throw new NoFreeRightNowPostsError();
	}
	return created;
}

async function patchRunningPost({
	path,
	body,
}: {
	path: string;
	body: unknown;
}): Promise<void> {
	const res = await fetchRest(path, { method: "PATCH", body });
	const urn = res.status === 400 ? errorUrnFromBody(res.text()) : null;
	if (urn !== null && sessionEndedUrns.has(urn)) {
		throw new RightNowSessionEndedError();
	}
	res.assertOk();
}

export async function updateRightNowPost({
	postId,
	changes,
}: {
	postId: number;
	changes: RightNowPostChanges;
}): Promise<void> {
	await patchRunningPost({
		path: `/v4/rightnow/posts/${postId}`,
		body: rightNowPostChangesSchema.parse(changes),
	});
}

export async function setRightNowPostHidden({
	postId,
	hidden,
}: {
	postId: number;
	hidden: boolean;
}): Promise<void> {
	await patchRunningPost({
		path: `/v1/rightnow/posts/${postId}/settings`,
		body: { hidden },
	});
}
