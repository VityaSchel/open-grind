import type {
	RightNowPostDetails,
	RightNowPostRequest,
} from "#lib/model/right-now/post.ts";
import { liveModeratedText } from "./post/post-form";

type PostMedia = RightNowPostDetails["media"][number];

const textRejectReasonLabels = new Map([
	["BULLYING", "Bullying"],
	["SELF_HARM", "Self harm"],
	["DRUG_PATTERNS", "Drug patterns"],
	["HATE_SPEECH", "Hate speech"],
	["SOL_SEX", "Solicitation of sex"],
	["SPAM_DISRUPT", "Spam/disruption"],
	["UNDERAGE", "Content with minors"],
	["OTHER", "Other"],
]);

export function textRejectReasonLabel({ reason }: { reason: string }): string {
	return textRejectReasonLabels.get(reason) ?? "Other";
}

export function isLivePost(post: RightNowPostDetails): boolean {
	return (
		post.postStatus !== "AWAITING_PAYMENT" && post.postStatus !== "EXPIRED"
	);
}

export function isAwaitingModeration(post: RightNowPostDetails): boolean {
	return (
		liveModeratedText({ post, status: "AWAITING_MODERATION" }) !== null ||
		post.media.some(({ state }) => state === "PENDING")
	);
}

export function rejectedParts(post: RightNowPostDetails | null): {
	text: RightNowPostDetails["moderatedText"];
	photos: PostMedia[];
} {
	return {
		text:
			post === null
				? null
				: liveModeratedText({ post, status: "MODERATION_FAILED" }),
		photos: post?.media.filter(({ state }) => state === "REJECTED") ?? [],
	};
}

export function rejectionKeys(post: RightNowPostDetails | null): string[] {
	const { text, photos } = rejectedParts(post);
	return [
		...(text === null ? [] : [`text-${text.id}`]),
		...photos.map(({ mediaId }) => `photo-${mediaId}`),
	];
}

function repostText(post: RightNowPostDetails): string {
	return (
		liveModeratedText({ post, status: "AWAITING_MODERATION" })?.text ??
		post.activeText ??
		""
	);
}

export function repostRequest(post: RightNowPostDetails): RightNowPostRequest {
	const text = repostText(post);
	const photo = post.media.find(
		({ state }) => state !== "REJECTED" && state !== "DELETED",
	);
	const shareLocation = post.shareLocation ?? "NONE";
	return {
		...(text !== "" && { text }),
		shareLocation,
		...(shareLocation !== "NONE" &&
			post.locationRadius !== null && {
				locationRadius: post.locationRadius,
			}),
		media:
			photo === undefined
				? []
				: [{ type: "image_v1", data: { id: photo.mediaId } }],
		hosting: post.hosting,
	};
}
