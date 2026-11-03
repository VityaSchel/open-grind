import {
	type RightNowMediaUploadResponse,
	type RightNowOwnPostMedia,
	type RightNowPostChanges,
	rightNowPostChangesSchema,
	type RightNowPostDetails,
	type RightNowPostRequest,
	rightNowPostRequestSchema,
} from "#lib/model/right-now/post.ts";
import { now } from "#lib/util/clock.ts";
import { demoMeProfileId, HOUR, SECOND } from "../config";
import type { DemoResponse } from "../route";
import { picsum } from "./avatars";

export type DemoRightNowPostMedia = RightNowOwnPostMedia & {
	contentType: "image/jpeg";
	isRejectAutomated: true;
	source: "RIGHT_NOW";
};

type DemoRightNowPost = Omit<RightNowPostDetails, "media"> & {
	media: DemoRightNowPostMedia[];
	isDiscreet: "NOT_SELECTED" | "FALSE";
	sharedFields: string[];
	boostUpsellOfferAvailableUntil: null;
};

export const POST_LIFETIME = HOUR;
const TEXT_MODERATION_DELAY = 10 * SECOND;

const clientAction: DemoResponse = {
	status: 400,
	body: {
		status: 400,
		title: "Action not allowed at this time",
		type: "urn:gr:err:client_action",
	},
};

const resourceNotFound: DemoResponse = {
	status: 400,
	body: { status: 400, type: "urn:gr:err:resource_not_found" },
};

const noContent: DemoResponse = { status: 204, body: null };

let freePostsLeft = 3;
let nextPostId = 890_000;
let nextModeratedTextId = 895_000;
let nextUploadedMediaId = 670_000;
let ownPost: DemoRightNowPost | null = null;
const uploadedPhotoUrls = new Map<number, string>();

export function demoUploadRightNowPhoto({
	url,
}: {
	url: string;
}): RightNowMediaUploadResponse {
	const mediaId = nextUploadedMediaId++;
	uploadedPhotoUrls.set(mediaId, url);
	return { mediaId, url, thumbnailUrl: url };
}

export function demoRightNowPhoto({
	mediaId,
	seed,
	url,
}: {
	mediaId: number;
	seed: string;
	url?: string;
}): DemoRightNowPostMedia {
	return {
		mediaId,
		thumbnailUrl: url ?? picsum({ seed, width: 480, height: 480 }),
		fullImageUrl: url ?? picsum({ seed, width: 1024, height: 1024 }),
		contentType: "image/jpeg",
		state: "APPROVED",
		reason: null,
		isRejectAutomated: true,
		shouldBlur: false,
		isNsfw: false,
		source: "RIGHT_NOW",
	};
}

function postMedia(
	media: RightNowPostRequest["media"],
): DemoRightNowPostMedia[] {
	return media.map(({ data: { id } }) =>
		demoRightNowPhoto({
			mediaId: id,
			seed: `right-now-own-${id}`,
			url: uploadedPhotoUrls.get(id),
		}),
	);
}

function moderatedText({
	postId,
	text,
}: {
	postId: number;
	text: string | undefined;
}): DemoRightNowPost["moderatedText"] {
	if (!text) return null;
	const createdAt = now();
	return {
		id: nextModeratedTextId++,
		postId,
		text,
		textStatus: "AWAITING_MODERATION",
		rejectReasons: [],
		createdAt,
		updatedAt: createdAt,
		deleted: false,
	};
}

function hasExpired(post: DemoRightNowPost): boolean {
	return post.expiration !== null && now() >= post.expiration;
}

function settleModeration(post: DemoRightNowPost): void {
	const pending = post.moderatedText;
	if (pending === null || now() - pending.createdAt < TEXT_MODERATION_DELAY)
		return;
	post.activeText = pending.text;
	post.moderatedText = null;
}

export function demoActiveRightNowPost(): DemoRightNowPost | null {
	if (ownPost === null || hasExpired(ownPost)) return null;
	settleModeration(ownPost);
	return structuredClone(ownPost);
}

function demoCreateRightNowPost({
	post,
}: {
	post: RightNowPostRequest;
}): DemoResponse {
	if (ownPost !== null && !hasExpired(ownPost)) return clientAction;
	const id = nextPostId++;
	const paid = freePostsLeft > 0;
	const posted = paid ? now() : null;
	const created: DemoRightNowPost = {
		id,
		profileId: demoMeProfileId,
		posted,
		expiration: posted === null ? null : posted + POST_LIFETIME,
		hosting: post.hosting,
		activeText: null,
		moderatedText: moderatedText({ postId: id, text: post.text }),
		media: postMedia(post.media),
		lat: null,
		lon: null,
		postStatus: paid ? "ACTIVE" : "AWAITING_PAYMENT",
		shareLocation: post.shareLocation,
		locationRadius: post.locationRadius ?? 0,
		isDiscreet: "NOT_SELECTED",
		sharedFields: [],
		boostUpsellOfferAvailableUntil: null,
	};
	if (paid) {
		freePostsLeft--;
		ownPost = created;
	}
	return { status: 201, body: { post: structuredClone(created) } };
}

function editablePost(
	postId: number,
): { post: DemoRightNowPost } | { refusal: DemoResponse } {
	if (ownPost?.id !== postId) return { refusal: resourceNotFound };
	if (hasExpired(ownPost)) return { refusal: clientAction };
	return { post: ownPost };
}

function demoUpdateRightNowPost({
	postId,
	changes,
}: {
	postId: number;
	changes: RightNowPostChanges;
}): DemoResponse {
	const editable = editablePost(postId);
	if ("refusal" in editable) return editable.refusal;
	const { post } = editable;
	settleModeration(post);
	if (changes.text !== undefined) {
		post.activeText = changes.text || null;
		post.moderatedText = null;
	}
	if (changes.hosting !== undefined) post.hosting = changes.hosting;
	if (changes.media !== undefined) post.media = postMedia(changes.media);
	if (changes.shareLocation !== undefined)
		post.shareLocation = changes.shareLocation;
	if (changes.locationRadius !== undefined)
		post.locationRadius = changes.locationRadius;
	post.isDiscreet = "FALSE";
	return noContent;
}

function demoSetRightNowPostHidden({
	postId,
	hidden,
}: {
	postId: number;
	hidden: boolean | undefined;
}): DemoResponse {
	if (hidden === undefined) return clientAction;
	const editable = editablePost(postId);
	if ("refusal" in editable) return editable.refusal;
	editable.post.postStatus = hidden ? "HIDDEN" : "ACTIVE";
	return noContent;
}

export function demoRightNowPostRoute({
	method,
	rawPath,
	body,
}: {
	method: string;
	rawPath: string;
	body: unknown;
}): DemoResponse | null {
	if (method === "GET" && rawPath === "/v1/rightnow/entitlements/posts")
		return { status: 200, body: { type: "GRANTED", count: freePostsLeft } };
	if (method === "GET" && rawPath === "/v3/rightnow/active-post")
		return { status: 200, body: { post: demoActiveRightNowPost() } };
	if (method === "POST" && rawPath === "/v3/rightnow/posts")
		return demoCreateRightNowPost({
			post: rightNowPostRequestSchema.parse(body),
		});
	const segments = rawPath.split("/").filter(Boolean);
	const [version, area, posts, id, settings] = segments;
	if (method !== "PATCH" || area !== "rightnow" || posts !== "posts")
		return null;
	if (version === "v4" && segments.length === 4)
		return demoUpdateRightNowPost({
			postId: Number(id),
			changes: rightNowPostChangesSchema.parse(body),
		});
	if (version === "v1" && segments.length === 5 && settings === "settings") {
		const { hidden } = (body ?? {}) as { hidden?: boolean };
		return demoSetRightNowPostHidden({ postId: Number(id), hidden });
	}
	return null;
}
