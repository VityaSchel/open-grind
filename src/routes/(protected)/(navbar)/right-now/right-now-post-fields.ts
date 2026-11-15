import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
import type {
	RightNowModeratedText,
	RightNowPostDetails,
	RightNowPostDetailsMedia,
	RightNowPostRequest,
} from "#lib/model/right-now/post.ts";

const textRejectReasonKeys: Readonly<Record<string, PlainMessageKey>> = {
	BULLYING: "browse.rightNow.sheet.rejectReason.bullying",
	SELF_HARM: "browse.rightNow.sheet.rejectReason.selfHarm",
	DRUG_PATTERNS: "browse.rightNow.sheet.rejectReason.drugPatterns",
	HATE_SPEECH: "browse.rightNow.sheet.rejectReason.hateSpeech",
	SOL_SEX: "browse.rightNow.sheet.rejectReason.sexSolicitation",
	SPAM_DISRUPT: "browse.rightNow.sheet.rejectReason.spamDisruption",
	UNDERAGE: "browse.rightNow.sheet.rejectReason.underage",
	OTHER: "browse.rightNow.sheet.rejectReason.other",
};

export function textRejectReasonLabel({ reason }: { reason: string }): string {
	const key = Object.hasOwn(textRejectReasonKeys, reason)
		? textRejectReasonKeys[reason]
		: undefined;
	return t(key ?? "browse.rightNow.sheet.rejectReason.other");
}

function liveModeratedText({
	post,
	status,
}: {
	post: RightNowPostDetails;
	status?: RightNowModeratedText["textStatus"];
}): RightNowModeratedText | null {
	const { moderatedText } = post;
	if (moderatedText === null || moderatedText.deleted) return null;
	if (status !== undefined && moderatedText.textStatus !== status)
		return null;
	return moderatedText;
}

export function submittedPostText({
	post,
	status,
}: {
	post: RightNowPostDetails;
	status?: RightNowModeratedText["textStatus"];
}): string {
	return liveModeratedText({ post, status })?.text ?? post.activeText ?? "";
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
	text: RightNowModeratedText | null;
	photos: RightNowPostDetailsMedia[];
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

export function repostRequest(post: RightNowPostDetails): RightNowPostRequest {
	const text = submittedPostText({ post, status: "AWAITING_MODERATION" });
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
