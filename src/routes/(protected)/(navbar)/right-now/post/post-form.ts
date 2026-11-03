import type {
	RightNowPostChanges,
	RightNowPostDetails,
} from "#lib/model/right-now/post.ts";

export const POST_TEXT_MAX_LENGTH = 140;
export const LEAST_PRECISE_RADIUS = 100;

const NEAREST_RADIUS_METERS = 100;
const METERS_PER_RADIUS_STEP = 19;

export type PostPhoto = { mediaId: number; thumbnailUrl: string };

type ShareLocation = RightNowPostDetails["shareLocation"];

export type PostForm = {
	text: string;
	photo: PostPhoto | null;
	hosting: boolean;
	shareLocation: ShareLocation;
	locationRadius: number;
};

export function showsOnMap({
	shareLocation,
}: {
	shareLocation: ShareLocation;
}): boolean {
	return shareLocation === "DISTANCE_AND_MAP";
}

export function shareLocationFor({
	showOnMap,
}: {
	showOnMap: boolean;
}): ShareLocation {
	return showOnMap ? "DISTANCE_AND_MAP" : "NONE";
}

export function singleLinePostText({ text }: { text: string }): string {
	return text.replace(/\r\n|\r|\n/g, " ");
}

export function normalizePostText({ text }: { text: string }): string {
	return singleLinePostText({ text }).trim();
}

export function approximateRadiusMeters({
	locationRadius,
}: {
	locationRadius: number;
}): number {
	return NEAREST_RADIUS_METERS + METERS_PER_RADIUS_STEP * locationRadius;
}

export function submittedPostText({
	post,
}: {
	post: RightNowPostDetails;
}): string {
	const { moderatedText } = post;
	if (moderatedText !== null && !moderatedText.deleted)
		return moderatedText.text;
	return post.activeText ?? "";
}

export function postFormOf({ post }: { post: RightNowPostDetails }): PostForm {
	const photo = post.media.find(({ state }) => state !== "DELETED") ?? null;
	const { shareLocation } = post;
	return {
		text: submittedPostText({ post }),
		photo:
			photo === null
				? null
				: { mediaId: photo.mediaId, thumbnailUrl: photo.thumbnailUrl },
		hosting: post.hosting,
		shareLocation,
		locationRadius: showsOnMap({ shareLocation })
			? (post.locationRadius ?? LEAST_PRECISE_RADIUS)
			: LEAST_PRECISE_RADIUS,
	};
}

export function postChangesOf({
	initial,
	current,
}: {
	initial: PostForm;
	current: PostForm;
}): RightNowPostChanges {
	const changes: RightNowPostChanges = {};
	const text = normalizePostText({ text: current.text });
	if (text !== normalizePostText({ text: initial.text })) changes.text = text;
	if (current.photo?.mediaId !== initial.photo?.mediaId) {
		changes.media =
			current.photo === null
				? []
				: [{ type: "image_v1", data: { id: current.photo.mediaId } }];
	}
	if (current.hosting !== initial.hosting) changes.hosting = current.hosting;
	if (
		current.shareLocation !== initial.shareLocation &&
		current.shareLocation !== null
	) {
		changes.shareLocation = current.shareLocation;
	}
	if (
		showsOnMap(current) &&
		(!showsOnMap(initial) ||
			current.locationRadius !== initial.locationRadius)
	) {
		changes.locationRadius = current.locationRadius;
	}
	return changes;
}
