import { type MessageKey, t } from "$lib/i18n";
import type { GaymojiCategory, GaymojiItem } from "$lib/api/messaging/gaymoji";

export type GaymojiSection = {
	key: string;
	title: string;
	icon: GaymojiItem;
	items: GaymojiItem[];
};

const sectionTitleKeys = {
	wenChing: "chat.composer.stickers.gaymoji.sections.wenChing",
	datingAndSex: "chat.composer.stickers.gaymoji.sections.datingAndSex",
	body: "chat.composer.stickers.gaymoji.sections.body",
	profile: "chat.composer.stickers.gaymoji.sections.profile",
	holidays: "chat.composer.stickers.gaymoji.sections.holidays",
	objects: "chat.composer.stickers.gaymoji.sections.objects",
	mood: "chat.composer.stickers.gaymoji.sections.mood",
	other: "chat.composer.stickers.gaymoji.sections.other",
} as const satisfies Record<string, MessageKey>;

type SectionLook = {
	titleKey: (typeof sectionTitleKeys)[keyof typeof sectionTitleKeys];
	iconId: string;
};

export const KNOWN_GAYMOJI_CATEGORIES = new Map<string, SectionLook>([
	[
		"wen_ching_taiwan_stickers",
		{
			titleKey: sectionTitleKeys.wenChing,
			iconId: "wen_ching_05_type.png",
		},
	],
	[
		"dating+sex",
		{
			titleKey: sectionTitleKeys.datingAndSex,
			iconId: "2_1_Eggplant_1.png",
		},
	],
	[
		"body",
		{
			titleKey: sectionTitleKeys.body,
			iconId: "Bicep_with_medium_skin_tone.png",
		},
	],
	[
		"profile",
		{
			titleKey: sectionTitleKeys.profile,
			iconId: "Man_with_dark_skin_tone_and_short_hair.png",
		},
	],
	[
		"holiday",
		{
			titleKey: sectionTitleKeys.holidays,
			iconId: "1_1_0_Pride_02_PrideHeartStripe.png",
		},
	],
	[
		"objects",
		{
			titleKey: sectionTitleKeys.objects,
			iconId: "f_ice_cream_Rainbow.png",
		},
	],
	["mood", { titleKey: sectionTitleKeys.mood, iconId: "4_Happy_Mask.png" }],
]);

export const FEATURED_CATEGORY = "featured";

export const FEATURED_ORIGINAL_IDS = new Set([
	"Pinky_up.png",
	"2_6_Three_girls_sitting_at_table.png",
	"2_0_rainingMen2tiny.png",
	"1_6_2_WGbed.png",
	"1_6_2_WGgaysRule.png",
	"1_6_2_WGgrace.png",
]);

const OTHER_SECTION: SectionLook = {
	titleKey: sectionTitleKeys.other,
	iconId: "1_6_2_WGgaysRule.png",
};

function titleFromCategory(category: string): string {
	const words = category
		.replaceAll("+", " & ")
		.replaceAll("_", " ")
		.replace(/\s+/g, " ")
		.trim();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

export function gaymojiSections(
	categories: GaymojiCategory[],
): GaymojiSection[] {
	const byId = new Map(
		categories.flatMap(({ items }) =>
			items.map((item) => [item.id, item] as const),
		),
	);

	function section({
		key,
		look,
		items,
	}: {
		key: string;
		look: SectionLook | undefined;
		items: GaymojiItem[];
	}): GaymojiSection[] {
		const [first] = items;
		if (first === undefined) return [];
		const icon =
			(look === undefined ? undefined : byId.get(look.iconId)) ?? first;
		return [
			{
				key,
				title:
					look === undefined
						? titleFromCategory(key)
						: t(look.titleKey),
				icon,
				items,
			},
		];
	}

	const featuredOriginals =
		categories
			.find(({ name }) => name === FEATURED_CATEGORY)
			?.items.filter(({ id }) => FEATURED_ORIGINAL_IDS.has(id)) ?? [];

	return [
		...categories
			.filter(({ name }) => name !== FEATURED_CATEGORY)
			.flatMap(({ name, items }) =>
				section({
					key: name,
					look: KNOWN_GAYMOJI_CATEGORIES.get(name),
					items,
				}),
			),
		...section({
			key: FEATURED_CATEGORY,
			look: OTHER_SECTION,
			items: featuredOriginals,
		}),
	];
}
