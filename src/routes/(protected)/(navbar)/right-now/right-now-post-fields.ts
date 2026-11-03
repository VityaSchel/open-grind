import type {
	RightNowPostChanges,
	RightNowPostDetails,
	RightNowPostRequest,
} from "#lib/model/right-now/post.ts";
import { normalizePostText, submittedPostText } from "./post/post-form";

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
	const { moderatedText, media } = post;
	return (
		(moderatedText !== null &&
			!moderatedText.deleted &&
			moderatedText.textStatus === "AWAITING_MODERATION") ||
		media.some(({ state }) => state === "PENDING")
	);
}

export function rejectedParts(post: RightNowPostDetails | null): {
	text: RightNowPostDetails["moderatedText"];
	photos: PostMedia[];
} {
	const moderatedText = post?.moderatedText ?? null;
	return {
		text:
			moderatedText !== null &&
			!moderatedText.deleted &&
			moderatedText.textStatus === "MODERATION_FAILED"
				? moderatedText
				: null,
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

function sameMedia({
	post,
	media,
}: {
	post: RightNowPostDetails;
	media: NonNullable<RightNowPostChanges["media"]>;
}): boolean {
	const attached = post.media.filter(({ state }) => state !== "DELETED");
	return (
		attached.length === media.length &&
		attached.every(
			({ mediaId }, index) => mediaId === media[index]?.data.id,
		)
	);
}

export function changedPostFields({
	post,
	changes,
}: {
	post: RightNowPostDetails;
	changes: RightNowPostChanges;
}): RightNowPostChanges {
	const { hosting, media, shareLocation, locationRadius } = changes;
	const text =
		changes.text === undefined
			? undefined
			: normalizePostText({ text: changes.text });
	return {
		...(text !== undefined &&
			text !== submittedPostText({ post }) && { text }),
		...(hosting !== undefined && hosting !== post.hosting && { hosting }),
		...(media !== undefined && !sameMedia({ post, media }) && { media }),
		...(shareLocation !== undefined &&
			shareLocation !== post.shareLocation && { shareLocation }),
		...(locationRadius !== undefined &&
			locationRadius !== post.locationRadius && { locationRadius }),
	};
}

function repostText(post: RightNowPostDetails): string {
	const { moderatedText } = post;
	if (
		moderatedText !== null &&
		!moderatedText.deleted &&
		moderatedText.textStatus === "AWAITING_MODERATION"
	)
		return moderatedText.text;
	return post.activeText ?? "";
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
