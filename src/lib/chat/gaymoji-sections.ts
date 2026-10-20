import {
	FEATURED_ORIGINAL_IDS,
	GAYMOJI_SECTION_ICON_IDS,
} from "$lib/chat/gaymoji-ids";
import { type MessageKey, t } from "$lib/i18n";
import type { GaymojiCategory, GaymojiItem } from "$lib/api/messaging/gaymoji";

export type GaymojiSection = {
	key: string;
	title: string;
	titleFromCategory: boolean;
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
			iconId: GAYMOJI_SECTION_ICON_IDS.wenChing,
		},
	],
	[
		"dating+sex",
		{
			titleKey: sectionTitleKeys.datingAndSex,
			iconId: GAYMOJI_SECTION_ICON_IDS.datingAndSex,
		},
	],
	[
		"body",
		{
			titleKey: sectionTitleKeys.body,
			iconId: GAYMOJI_SECTION_ICON_IDS.body,
		},
	],
	[
		"profile",
		{
			titleKey: sectionTitleKeys.profile,
			iconId: GAYMOJI_SECTION_ICON_IDS.profile,
		},
	],
	[
		"holiday",
		{
			titleKey: sectionTitleKeys.holidays,
			iconId: GAYMOJI_SECTION_ICON_IDS.holidays,
		},
	],
	[
		"objects",
		{
			titleKey: sectionTitleKeys.objects,
			iconId: GAYMOJI_SECTION_ICON_IDS.objects,
		},
	],
	[
		"mood",
		{
			titleKey: sectionTitleKeys.mood,
			iconId: GAYMOJI_SECTION_ICON_IDS.mood,
		},
	],
]);

export const FEATURED_CATEGORY = "featured";

const OTHER_SECTION: SectionLook = {
	titleKey: sectionTitleKeys.other,
	iconId: GAYMOJI_SECTION_ICON_IDS.other,
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
				titleFromCategory: look === undefined,
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
