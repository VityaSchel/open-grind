import {
	type RightNowMediaUploadResponse,
	type RightNowPostChanges,
	type RightNowPostRequest,
	rightNowPostRequestSchema,
} from "#lib/model/right-now/post.ts";
import { now } from "#lib/util/clock.ts";
import { demoMeProfileId, HOUR, SECOND } from "../config";
import { picsum } from "./avatars";

type DemoResponse = { status: number; body: unknown };

export type DemoRightNowPostMedia = {
	mediaId: number;
	thumbnailUrl: string;
	fullImageUrl: string;
	contentType: "image/jpeg";
	state: "APPROVED";
	reason: null;
	isRejectAutomated: true;
	shouldBlur: false;
	isNsfw: false;
	source: "RIGHT_NOW";
};

type DemoModeratedText = {
	id: number;
	postId: number;
	text: string;
	textStatus: "AWAITING_MODERATION";
	rejectReasons: string[];
	createdAt: number;
	updatedAt: number;
	deleted: false;
};

export type DemoRightNowPost = {
	id: number;
	profileId: number;
	posted: number | null;
	expiration: number | null;
	hosting: boolean;
	activeText: string | null;
	moderatedText: DemoModeratedText | null;
	media: DemoRightNowPostMedia[];
	lat: null;
	lon: null;
	postStatus: "ACTIVE" | "HIDDEN" | "AWAITING_PAYMENT";
	shareLocation: RightNowPostRequest["shareLocation"];
	locationRadius: number;
	isDiscreet: "NOT_SELECTED" | "FALSE";
	sharedFields: string[];
	boostUpsellOfferAvailableUntil: null;
};

const POST_LIFETIME = HOUR;
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

function postMedia(
	media: RightNowPostRequest["media"],
): DemoRightNowPostMedia[] {
	return media.map(({ data: { id } }): DemoRightNowPostMedia => {
		const seed = `right-now-own-${id}`;
		const uploaded = uploadedPhotoUrls.get(id);
		return {
			mediaId: id,
			thumbnailUrl: uploaded ?? picsum({ seed, width: 480, height: 480 }),
			fullImageUrl:
				uploaded ?? picsum({ seed, width: 1024, height: 1024 }),
			contentType: "image/jpeg",
			state: "APPROVED",
			reason: null,
			isRejectAutomated: true,
			shouldBlur: false,
			isNsfw: false,
			source: "RIGHT_NOW",
		};
	});
}

function moderatedText({
	postId,
	text,
}: {
	postId: number;
	text: string | undefined;
}): DemoModeratedText | null {
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

export function demoRightNowPostEntitlements(): {
	type: "GRANTED";
	count: number;
} {
	return { type: "GRANTED", count: freePostsLeft };
}

export function demoActiveRightNowPost(): DemoRightNowPost | null {
	if (ownPost === null || hasExpired(ownPost)) return null;
	settleModeration(ownPost);
	return structuredClone(ownPost);
}

export function demoCreateRightNowPost({
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

export function demoUpdateRightNowPost({
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

export function demoSetRightNowPostHidden({
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
		return { status: 200, body: demoRightNowPostEntitlements() };
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
			changes: body as RightNowPostChanges,
		});
	if (version === "v1" && segments.length === 5 && settings === "settings") {
		const { hidden } = (body ?? {}) as { hidden?: boolean };
		return demoSetRightNowPostHidden({ postId: Number(id), hidden });
	}
	return null;
}
