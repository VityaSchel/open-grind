import { FilterPosition } from "#lib/model/browse/grid/filters.ts";
import { HivStatus } from "#lib/model/users/profiles.ts";
import {
	chance,
	hashString,
	mulberry32,
	pick,
	type Rng,
} from "#lib/util/random.ts";
import type {
	DiscreetPostData,
	PostData,
	RightNowPostMediaItem,
} from "#lib/model/right-now/feed.ts";
import { DEMO_ID_START, HOUR, MINUTE, NOW } from "../config";
import { picsum } from "./avatars";
import { demoFavoriteOf } from "./favorites";
import { num } from "./grid";
import {
	type DemoSeed,
	distanceForId,
	onlineUntilOf,
	photosOf,
	profileSeed,
} from "./profiles";
import {
	demoActiveRightNowPost,
	type DemoRightNowPostMedia,
} from "./right-now-post";

type DemoPostMedia = {
	type: "image_v1";
	data: RightNowPostMediaItem["data"] & {
		contentType: "image/jpeg";
		state: "APPROVED";
		source: "RIGHT_NOW";
	};
};

type DemoPostItem =
	| {
			type: "right_now_post_v3" | "locked_post_v1";
			data: Omit<PostData, "media"> & { media: DemoPostMedia[] };
	  }
	| {
			type: "discreet_right_now_post_v1";
			data: Omit<DiscreetPostData, "media"> & { media: DemoPostMedia[] };
	  };

type DemoFeedItem =
	| DemoPostItem
	| { type: "curated_post_v1"; data: { type: "tutorial_hosting_v1" } }
	| { type: "upsell_insert_v1"; data: { type: "xtra_upsell_v1" } };

type DemoFeedPost = { seed: DemoSeed; item: DemoPostItem };

const POST_TEXTS = [
	"Free now, coffee nearby? ☕",
	"Door's open, come over 🏠",
	"Anyone up for a drink downtown? 🍸",
	"Bored at home 👀",
	"Gym's done, now what?",
	"Just landed, show me around ✈️",
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
	"🔥🔥🔥",
];
const LOCKED_POST_KINDS = ["xtra_post_v1", "unlimited_post_v1"] as const;

const HOSTING_PROFILE_ID = 100006;
const AUTHOR_COUNT = 30;
const AUTHOR_ID_STRIDE = 97;
const LOCKED_INDEXES = new Set([5, 12, 19, 26]);
const DISCREET_INDEXES = new Set([9, 22]);
const POST_ID_START = 880_000;
const POST_MEDIA_ID_START = 660_000;
const POST_WINDOW = 55 * MINUTE;
const POST_LIFETIME = HOUR;
const CURATED_POSITION = 3;
const UPSELL_POSITION = 8;
const VIEWER_COUNT = 3 + (hashString("right-now-viewers") % 20);

const feedAuthorIds = [
	HOSTING_PROFILE_ID,
	...Array.from(
		{ length: AUTHOR_COUNT - 1 },
		(_, index) => DEMO_ID_START + index * AUTHOR_ID_STRIDE,
	),
];

const curatedItem: DemoFeedItem = {
	type: "curated_post_v1",
	data: { type: "tutorial_hosting_v1" },
};

const upsellItem: DemoFeedItem = {
	type: "upsell_insert_v1",
	data: { type: "xtra_upsell_v1" },
};

function postMedia({
	rng,
	index,
}: {
	rng: Rng;
	index: number;
}): DemoPostMedia[] {
	if (!chance({ rng, probability: 0.45 })) return [];
	const seed = `right-now-${POST_ID_START + index}`;
	return [
		{
			type: "image_v1",
			data: {
				mediaId: POST_MEDIA_ID_START + index,
				thumbnailUrl: picsum({ seed, width: 480, height: 480 }),
				fullImageUrl: picsum({ seed, width: 1024, height: 1024 }),
				contentType: "image/jpeg",
				state: "APPROVED",
				shouldBlur: false,
				isNsfw: false,
				source: "RIGHT_NOW",
			},
		},
	];
}

function feedPost({
	index,
	profileId,
}: {
	index: number;
	profileId: number;
}): DemoFeedPost {
	const seed = profileSeed(profileId);
	const rng = mulberry32(hashString(`right-now:${profileId}`));
	const media = postMedia({ rng, index });
	const text =
		media.length === 0 || chance({ rng, probability: 0.6 })
			? pick({ rng, items: POST_TEXTS })
			: undefined;
	const posted = NOW - Math.floor(rng() * POST_WINDOW);
	const post = {
		id: POST_ID_START + index,
		media,
		text,
		hosting:
			profileId === HOSTING_PROFILE_ID ||
			chance({ rng, probability: 0.4 }),
		posted,
		expiration: posted + POST_LIFETIME,
	};
	if (DISCREET_INDEXES.has(index)) {
		return {
			seed,
			item: {
				type: "discreet_right_now_post_v1",
				data: {
					...post,
					onlineUntil: onlineUntilOf(seed) ?? undefined,
					profileFields: {
						age: seed.age,
						height: seed.heightCm,
						weight: seed.weightG,
						position: seed.position,
					},
				},
			},
		};
	}
	const authored = {
		...post,
		profileId,
		mediaHash: photosOf(profileId)[0],
		displayName: seed.name ?? undefined,
		distance: distanceForId(profileId),
		recentlyChatted: chance({ rng, probability: 0.2 }),
		favorite: demoFavoriteOf({ profileId, seed: seed.favorite }),
	};
	if (LOCKED_INDEXES.has(index)) {
		return {
			seed,
			item: {
				type: "locked_post_v1",
				data: {
					...authored,
					type: pick({ rng, items: LOCKED_POST_KINDS }),
				},
			},
		};
	}
	return {
		seed,
		item: {
			type: "right_now_post_v3",
			data: {
				...authored,
				onlineUntil: onlineUntilOf(seed) ?? undefined,
				isOnPrep: seed.hiv === HivStatus.NegativeOnPrep,
			},
		},
	};
}

function ownFeedMedia(media: DemoRightNowPostMedia): DemoPostMedia {
	const { mediaId, thumbnailUrl, fullImageUrl } = media;
	return {
		type: "image_v1",
		data: {
			mediaId,
			thumbnailUrl,
			fullImageUrl,
			contentType: "image/jpeg",
			state: "APPROVED",
			shouldBlur: false,
			isNsfw: false,
			source: "RIGHT_NOW",
		},
	};
}

function ownFeedPosts(): DemoFeedPost[] {
	const post = demoActiveRightNowPost();
	if (
		post?.postStatus !== "ACTIVE" ||
		post.posted === null ||
		post.expiration === null
	)
		return [];
	const seed = profileSeed(post.profileId);
	return [
		{
			seed,
			item: {
				type: "right_now_post_v3",
				data: {
					id: post.id,
					profileId: post.profileId,
					mediaHash: photosOf(post.profileId)[0],
					displayName: seed.name ?? undefined,
					media: post.media.map(ownFeedMedia),
					text: post.activeText ?? undefined,
					hosting: post.hosting,
					posted: post.posted,
					expiration: post.expiration,
					recentlyChatted: false,
					favorite: false,
					onlineUntil: onlineUntilOf(seed) ?? undefined,
					isOnPrep: seed.hiv === HivStatus.NegativeOnPrep,
				},
			},
		},
	];
}

function matchesFeedQuery(
	params: URLSearchParams,
): (post: DemoFeedPost) => boolean {
	const hosting = params.get("hosting");
	const ageMin = num(params.get("ageMin"));
	const ageMax = num(params.get("ageMax"));
	const positions = (params.get("sexualPositions") ?? "")
		.split(",")
		.filter(Boolean)
		.map(Number);
	return ({ seed, item }) => {
		if (hosting !== null && item.data.hosting !== (hosting === "true"))
			return false;
		if (ageMin !== undefined && (seed.age === null || seed.age < ageMin))
			return false;
		if (ageMax !== undefined && (seed.age === null || seed.age > ageMax))
			return false;
		return (
			positions.length === 0 ||
			positions.includes(seed.position ?? FilterPosition.NotSpecified)
		);
	};
}

function feedOrder(
	sort: string | null,
): (a: DemoFeedPost, b: DemoFeedPost) => number {
	const newestFirst = (a: DemoFeedPost, b: DemoFeedPost) =>
		b.item.data.posted - a.item.data.posted;
	if (sort !== "DISTANCE") return newestFirst;
	const distance = ({ item }: DemoFeedPost) =>
		item.data.distance ?? Number.POSITIVE_INFINITY;
	return (a, b) => distance(a) - distance(b) || newestFirst(a, b);
}

export function demoRightNowFeed(params: URLSearchParams) {
	const posts: DemoFeedItem[] = [
		...ownFeedPosts(),
		...feedAuthorIds.map((profileId, index) =>
			feedPost({ index, profileId }),
		),
	]
		.filter(matchesFeedQuery(params))
		.sort(feedOrder(params.get("sort")))
		.map(({ item }) => item);
	return {
		items: posts
			.toSpliced(CURATED_POSITION, 0, curatedItem)
			.toSpliced(UPSELL_POSITION, 0, upsellItem),
		viewerCount: VIEWER_COUNT,
	};
}
