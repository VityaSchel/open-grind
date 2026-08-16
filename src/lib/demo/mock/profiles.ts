import {
	BodyType,
	type BodyTypeId,
	Ethnicity,
	type EthnicityId,
	HivStatus,
	type HivStatusId,
	LookingFor,
	type LookingForId,
	RelationshipStatus,
	type RelationshipStatusId,
	SexualPosition,
	type SexualPositionId,
	type SocialNetworks,
	Tribe,
	type TribeId,
} from "$lib/model/users/profiles";
import {
	chance,
	hashString,
	mulberry32,
	pick,
	type Rng,
	subset,
} from "$lib/util/random";
import { DAY, demoMeProfileId, HOUR, MINUTE, NOW } from "../config";
import { registerPhoto } from "./avatars";

export type DemoSeed = {
	id: number;
	name: string | null;
	age: number | null;
	showAge: boolean;
	position: SexualPositionId | null;
	photos: number;
	bio: string | null;
	tribes: TribeId[];
	lookingFor: LookingForId[];
	body: BodyTypeId | null;
	ethnicity: EthnicityId | null;
	relationship: RelationshipStatusId | null;
	hiv: HivStatusId | null;
	heightCm: number | null;
	weightG: number | null;
	distanceM: number | null;
	online: boolean;
	favorite: boolean;
	unread: number;
	instagram: string | null;
};

const FIRST_NAMES = [
	"James",
	"Liam",
	"Noah",
	"Oliver",
	"Elijah",
	"Lucas",
	"Mason",
	"Logan",
	"Ethan",
	"Jacob",
	"Henry",
	"Sebastian",
	"Jack",
	"Owen",
	"Theo",
	"Leo",
	"Daniel",
	"Caleb",
	"Ryan",
	"Nathan",
	"Adam",
	"Isaac",
	"Aaron",
	"Marcus",
	"Connor",
	"Eli",
	"Aiden",
	"Gabriel",
	"Julian",
	"Hunter",
	"Cameron",
	"Tyler",
	"Brandon",
	"Cole",
	"Dylan",
	"Evan",
	"Felix",
	"George",
	"Harrison",
	"Ian",
	"Jasper",
	"Kyle",
	"Levi",
	"Miles",
	"Nolan",
	"Oscar",
	"Parker",
	"Quinn",
	"Reed",
	"Simon",
	"Tobias",
	"Victor",
	"Wesley",
	"Xavier",
	"Zane",
	"Adrian",
	"Blake",
	"Chris",
	"Derek",
	"Emmett",
	"Finn",
	"Grant",
	"Hugo",
	"Ivan",
	"Jonah",
	"Kevin",
	"Liam",
	"Max",
	"Nash",
	"Otto",
	"Pablo",
	"Rhys",
];

const NAME_EMOJIS = [
	"🐻",
	"🦊",
	"😎",
	"🔥",
	"🌊",
	"🌵",
	"🦅",
	"🐺",
	"💪",
	"🎧",
	"🍑",
	"🍆",
	"💦",
	"👀",
	"🌈",
	"⚡",
	"🥃",
	"🌙",
	"🏖️",
	"🎬",
	"🍀",
	"🦴",
];

const LOREM =
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const LOREM_LONG =
	"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";
const LONG_WORD =
	"Pneumonoultramicroscopicsilicovolcanoconiosisantidisestablishmentarianismfloccinaucinihilipilification";
const LONG_WORD_2 =
	"Loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlaboreetdoloremagnaaliqua";

const LOREM_BIOS = [
	LOREM,
	LOREM_LONG,
	"lorem ipsum dolor sit amet",
	"Ut enim ad minim veniam.",
	"Duis aute irure dolor.",
	"Demo",
	"[ placeholder ]",
	"consectetur adipiscing elit",
];
const EMOJI_BIOS = ["🔥🔥🔥", "👀💬🍑", "😎🌊", "🍆🍑💦", "🌈⚡🥃", "👀"];

const POSITIONS: (SexualPositionId | null)[] = [
	null,
	SexualPosition.Top,
	SexualPosition.Bottom,
	SexualPosition.Versatile,
	SexualPosition.VersBottom,
	SexualPosition.VersTop,
	SexualPosition.Side,
];
const TRIBES = Object.values(Tribe);
const LOOKING_FOR = Object.values(LookingFor);
const BODIES = Object.values(BodyType);
const ETHNICITIES = Object.values(Ethnicity);
const RELATIONSHIPS = Object.values(RelationshipStatus);
const HIV = Object.values(HivStatus);

function generatedName(rng: Rng): string | null {
	const style = rng();
	if (style < 0.06) return null;
	if (style < 0.11) {
		const count = 1 + Math.floor(rng() * 3);
		return Array.from({ length: count }, () =>
			pick({ rng, items: NAME_EMOJIS }),
		).join("");
	}
	const base = pick({ rng, items: FIRST_NAMES });
	const variant = rng();
	if (variant < 0.1) return base.toLowerCase();
	if (variant < 0.17) return base.toUpperCase();
	if (variant < 0.3) return `${base} ${pick({ rng, items: NAME_EMOJIS })}`;
	if (variant < 0.38) return `${base}${10 + Math.floor(rng() * 89)}`;
	return base;
}

function generatedBio(rng: Rng): string | null {
	const style = rng();
	if (style < 0.18) return null;
	if (style < 0.28) return "";
	if (style < 0.4) return pick({ rng, items: EMOJI_BIOS });
	if (style < 0.48) return pick({ rng, items: [LONG_WORD, LONG_WORD_2] });
	return pick({ rng, items: LOREM_BIOS });
}

function generatedPhotoCount(rng: Rng): number {
	const r = rng();
	if (r < 0.12) return 0;
	if (r < 0.45) return 1;
	if (r < 0.72) return 2;
	if (r < 0.88) return 3;
	if (r < 0.96) return 4;
	return 5;
}

const featuredOverrides = new Map<number, Partial<DemoSeed>>([
	[
		100001,
		{
			name: "James",
			photos: 3,
			bio: LOREM,
			distanceM: 1,
			favorite: true,
			unread: 2,
		},
	],
	[
		100002,
		{
			name: "🐻",
			age: 45,
			photos: 1,
			bio: "",
			distanceM: 2,
			tribes: [Tribe.Bear, Tribe.Daddy],
		},
	],
	[
		100003,
		{
			name: null,
			age: null,
			showAge: false,
			photos: 0,
			bio: null,
			distanceM: 3,
			position: null,
		},
	],
	[100004, { name: "Noah", photos: 4, bio: LONG_WORD, distanceM: 4 }],
	[
		100005,
		{
			name: "MARCUS",
			photos: 2,
			bio: "lorem ipsum dolor sit amet",
			distanceM: 5,
		},
	],
	[
		100006,
		{
			name: "theo 🌊",
			photos: 1,
			bio: "👀 just here to chat",
			distanceM: 6,
			unread: 5,
		},
	],
	[
		100007,
		{
			name: "Benjamin",
			age: 39,
			showAge: false,
			photos: 2,
			bio: LOREM_LONG,
			distanceM: 7,
		},
	],
	[100008, { name: "🦊", age: 19, photos: 1, bio: "👀💬🍑", distanceM: 8 }],
	[
		100009,
		{
			name: "Henry",
			age: 52,
			photos: 3,
			bio: LOREM_LONG,
			distanceM: 9,
			unread: 1,
		},
	],
	[100010, { name: null, age: 40, photos: 0, bio: null, distanceM: 10 }],
	[100011, { name: "Lucas90", photos: 2, bio: LONG_WORD_2, distanceM: 11 }],
	[100012, { name: "😎🔥💯", age: 29, photos: 1, bio: "", distanceM: 12 }],
	[
		100013,
		{
			name: "Alexander",
			photos: 5,
			bio: LOREM,
			distanceM: 13,
			favorite: true,
		},
	],
	[
		100014,
		{
			name: "Daniel",
			position: null,
			photos: 2,
			bio: "[ placeholder ]",
			distanceM: 14,
		},
	],
	[100015, { name: "Leo", age: 21, photos: 0, bio: "🍆🍑💦", distanceM: 15 }],
	[100016, { name: "liam", photos: 3, bio: LOREM, distanceM: 16 }],
	[100250, { favorite: false }],
	[100777, { favorite: false }],
]);

export function distanceForId(id: number): number {
	const override = featuredOverrides.get(id);
	if (
		override &&
		override.distanceM !== null &&
		override.distanceM !== undefined
	)
		return override.distanceM;
	return Math.floor(mulberry32(hashString(`dist:${id}`))() * 40000);
}

export const meSeed: DemoSeed = {
	id: demoMeProfileId,
	name: "Me",
	age: 30,
	showAge: true,
	position: SexualPosition.Versatile,
	photos: 2,
	bio: "Lorem ipsum — this is you.",
	tribes: [Tribe.Geek],
	lookingFor: [LookingFor.Chat, LookingFor.Friends],
	body: BodyType.Average,
	ethnicity: null,
	relationship: RelationshipStatus.Single,
	hiv: HivStatus.NegativeOnPrep,
	heightCm: 178,
	weightG: 75_000,
	distanceM: null,
	online: true,
	favorite: false,
	unread: 0,
	instagram: "demo.user",
};

const seedCache = new Map<number, DemoSeed>();

export function profileSeed(id: number): DemoSeed {
	const cached = seedCache.get(id);
	if (cached) return cached;
	const seed = id === demoMeProfileId ? meSeed : buildSeed(id);
	seedCache.set(id, seed);
	return seed;
}

function buildSeed(id: number): DemoSeed {
	const rng = mulberry32(hashString(`profile:${id}`));
	const hasAge = chance({ rng, probability: 0.92 });
	const base: DemoSeed = {
		id,
		name: generatedName(rng),
		age: hasAge ? 18 + Math.floor(rng() * 47) : null,
		showAge: hasAge ? chance({ rng, probability: 0.9 }) : false,
		position: pick({ rng, items: POSITIONS }),
		photos: generatedPhotoCount(rng),
		bio: generatedBio(rng),
		tribes: subset({ rng, items: TRIBES, max: 3 }),
		lookingFor: subset({ rng, items: LOOKING_FOR, max: 3 }),
		body: chance({ rng, probability: 0.7 })
			? pick({ rng, items: BODIES })
			: null,
		ethnicity: chance({ rng, probability: 0.6 })
			? pick({ rng, items: ETHNICITIES })
			: null,
		relationship: chance({ rng, probability: 0.4 })
			? pick({ rng, items: RELATIONSHIPS })
			: null,
		hiv: chance({ rng, probability: 0.45 })
			? pick({ rng, items: HIV })
			: null,
		heightCm: chance({ rng, probability: 0.6 })
			? 160 + Math.floor(rng() * 40)
			: null,
		weightG: chance({ rng, probability: 0.5 })
			? (60 + Math.floor(rng() * 45)) * 1000
			: null,
		distanceM: distanceForId(id),
		online: chance({ rng, probability: 0.45 }),
		favorite: chance({ rng, probability: 0.12 }),
		unread: 0,
		instagram: chance({ rng, probability: 0.25 })
			? `${pick({ rng, items: FIRST_NAMES }).toLowerCase()}_${id % 1000}`
			: null,
	};
	base.unread =
		base.favorite && chance({ rng, probability: 0.5 })
			? 1 + Math.floor(rng() * 5)
			: 0;
	const override = featuredOverrides.get(id);
	return override ? { ...base, ...override } : base;
}

const photoCache = new Map<number, string[]>();

export function photosOf(id: number): string[] {
	const cached = photoCache.get(id);
	if (cached) return cached;
	const count = profileSeed(id).photos;
	const photos = Array.from({ length: count }, (_, i) =>
		registerPhoto(i === 0 ? String(id) : `${id}-${i}`),
	);
	photoCache.set(id, photos);
	return photos;
}

export function onlineUntilOf(seed: DemoSeed): number | null {
	return seed.online ? NOW + 12 * MINUTE : null;
}

export function lastOnlineOf(seed: DemoSeed): number {
	return seed.online ? NOW - 2 * MINUTE : NOW - ((seed.id % 47) + 1) * HOUR;
}

export function socialNetworksOf(seed: DemoSeed): SocialNetworks {
	return seed.instagram ? { instagram: { userId: seed.instagram } } : {};
}

export function mediasOf(seed: DemoSeed) {
	return photosOf(seed.id).map((mediaHash, i) => ({
		mediaHash,
		type: 1,
		state: 2,
		reason: null,
		takenOnGrindr: i === 0,
		createdAt: NOW - (i + 1) * DAY,
	}));
}
