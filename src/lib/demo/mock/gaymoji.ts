import {
	FEATURED_CATEGORY,
	FEATURED_ORIGINAL_IDS,
	KNOWN_GAYMOJI_CATEGORIES,
} from "$lib/chat/gaymoji-sections";
import { hashString } from "$lib/util/random";

const LAST_UPDATE_TIME = 1605145583000;
const EXPIRED_TIME = 1621843200000;
const IMAGE_SIZE = 256;

const CATEGORIES = [
	{ name: "wen_ching_taiwan_stickers", count: 10, prefix: "wen_ching" },
	{ name: "featured", count: 67, prefix: "1" },
	{ name: "dating+sex", count: 103, prefix: "1" },
	{ name: "body", count: 63, prefix: "a" },
	{ name: "profile", count: 111, prefix: "Man" },
	{ name: "holiday", count: 92, prefix: "1_1_0" },
	{ name: "objects", count: 99, prefix: "1" },
	{ name: "mood", count: 34, prefix: "" },
] as const;

const EXPIRING_CATEGORY = "wen_ching_taiwan_stickers";

const WORDS = [
	"Yass",
	"Kiki",
	"Rainbow_unicorn",
	"Peach",
	"Eggplant",
	"Coffee",
	"Heart",
	"Wink",
	"Hello",
	"Bear",
	"Otter",
	"Pride_flag",
	"Party_hat",
	"Dumbbell",
	"Couch_potato",
	"Disco_ball",
	"Sunglasses",
	"Lipstick",
	"Crown",
	"Taco",
	"Champagne",
	"Fire",
	"Sparkles",
	"Kiss",
	"Selfie",
	"Beach",
	"Moon",
	"Star",
	"Cupcake",
	"Bunny",
	"Pizza",
	"Cocktail",
	"Leather_jacket",
	"Tank_top",
	"High_heels",
	"Thumbs_up",
	"Shrug",
	"Facepalm",
	"Chill_mask",
	"Lol",
];

type DemoGaymoji = {
	name: string;
	id: string;
	category: string;
	expiredTime?: number;
};

function gaymojiName({
	prefix,
	index,
	word,
}: {
	prefix: string;
	index: number;
	word: string;
}): string {
	const ordinal = String(index + 1).padStart(2, "0");
	return prefix === ""
		? `${ordinal}_${word}`
		: `${prefix}_${ordinal}_${word}`;
}

function realIds(category: string): string[] {
	if (category === FEATURED_CATEGORY) return [...FEATURED_ORIGINAL_IDS];
	const known = KNOWN_GAYMOJI_CATEGORIES.get(category);
	return known ? [known.iconId] : [];
}

function buildManifest() {
	const gaymoji: DemoGaymoji[] = [];
	let wordIndex = 0;
	for (const { name: category, count, prefix } of CATEGORIES) {
		const real = realIds(category).map((id) => id.replace(/\.png$/, ""));
		const made = Array.from({ length: count - real.length }, (_, index) => {
			const word = WORDS[wordIndex % WORDS.length] ?? "Heart";
			wordIndex += 1;
			return gaymojiName({ prefix, index, word });
		});
		for (const name of [...real, ...made]) {
			gaymoji.push({
				...(category === EXPIRING_CATEGORY
					? { expiredTime: EXPIRED_TIME }
					: {}),
				name,
				id: `${name}.png`,
				category,
			});
		}
	}
	return {
		lastUpdateTime: LAST_UPDATE_TIME,
		category: CATEGORIES.map(({ name }) => ({
			name,
			expiredTime: name === EXPIRING_CATEGORY ? EXPIRED_TIME : 0,
		})),
		gaymoji,
	};
}

let manifest: ReturnType<typeof buildManifest> | null = null;

export function demoGaymojiManifest() {
	manifest ??= buildManifest();
	return manifest;
}

export function demoGaymojiImageUrl(id: string): string {
	const hue = hashString(id) % 360;
	const center = IMAGE_SIZE / 2;
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">` +
		`<circle cx="${center}" cy="${center}" r="${center - 16}" fill="hsl(${hue} 75% 60%)"/>` +
		`<circle cx="${center - 36}" cy="${center - 24}" r="14" fill="#1f1f1f"/>` +
		`<circle cx="${center + 36}" cy="${center - 24}" r="14" fill="#1f1f1f"/>` +
		`<path d="M${center - 52} ${center + 28} Q${center} ${center + 84} ${center + 52} ${center + 28}" fill="none" stroke="#1f1f1f" stroke-width="12" stroke-linecap="round"/>` +
		`</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
