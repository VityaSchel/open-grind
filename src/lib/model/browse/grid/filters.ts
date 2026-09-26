import z from "zod";

import {
	AcceptNSFWPics,
	BodyType,
	HealthPractice,
	LookingFor,
	MeetAt,
	RelationshipStatus,
	SexualPosition,
	Tribe,
} from "$lib/model/users/profiles";
import {
	type ProfileTagsResponse,
	tagsOf,
	tagTextByKey,
} from "$lib/model/users/tags";
import type { Gender } from "$lib/model/users/genders";
import type { UnitSystem } from "$lib/util/units";

export const filterIsFavoriteSchema = z.boolean();
export const filterIsOnlineSchema = z.boolean();
export const filterIsRightNowSchema = z.boolean();
export const filterIsFreshSchema = z.boolean();

const rangeSchema = ({ min, max }: { min: number; max: number }) =>
	z
		.array(
			z
				.number()
				.transform((bound) => Math.min(Math.max(bound, min), max)),
		)
		.length(2);

export const isFullRange = ({
	range: [from, to],
	min,
	max,
}: {
	range: number[];
	min: number;
	max: number;
}) => from === min && to === max;

export const rangeBoundTexts = ({
	floor,
	ceiling,
	range: [min = floor, max = ceiling],
	format,
	units,
}: {
	floor: number;
	ceiling: number;
	range: number[];
	format: (value: number, units: UnitSystem) => string;
	units: UnitSystem;
}): [string, string] => [
	min === floor ? "No min" : format(min, units),
	max === ceiling ? "No max" : format(max, units),
];

export const AGE_MIN = 18;
export const AGE_MAX = 99;

export const ageRangeLabel = ([from, to]: number[]) =>
	to === AGE_MAX ? `${from} years & over` : `${from} - ${to}`;

export const filterAgeEnabledSchema = z.boolean();
export const filterAgeSchema = rangeSchema({ min: AGE_MIN, max: AGE_MAX });

export const filterGendersEnabledSchema = z.boolean().default(false);
export const filterGendersSchema = z.array(
	z.int().nonnegative().or(z.literal(-1)),
);

export const GENDER_ASK_ME = 62;

export const isFilterableGenderId = (id: number) => id !== GENDER_ASK_ME;

export const isFilterableGender = (
	gender: Gender,
): gender is Gender & { sortFilter: number } =>
	typeof gender.sortFilter === "number" &&
	isFilterableGenderId(gender.genderId);

export const filterTagsEnabledSchema = z.boolean();
export const filterTagsSchema = z.array(z.string());

const TAG_KEYS_MOVED_TO_GENDERS = ["ftm", "mtf"];

export const isFilterableTagKey = (key: string) =>
	!TAG_KEYS_MOVED_TO_GENDERS.includes(key);

export function tagCatalog(languages: ProfileTagsResponse) {
	const textByKey = tagTextByKey(languages);
	const textsByKey = new Map<string, string[]>();
	const keyByText = new Map<string, string>();
	for (const { key, text } of tagsOf(languages)) {
		const textLower = text.toLowerCase();
		if (!keyByText.has(textLower)) keyByText.set(textLower, key);
		textsByKey.set(key, [...(textsByKey.get(key) ?? []), textLower]);
	}
	return {
		categories: (languages[0]?.categoryCollection ?? []).map(
			(category) => ({
				...category,
				tags: category.tags.filter(({ key }) =>
					isFilterableTagKey(key),
				),
			}),
		),
		flat: [...textByKey]
			.filter(([key]) => isFilterableTagKey(key))
			.map(([key, text]) => ({
				key,
				text,
				textsLower: textsByKey.get(key) ?? [],
			}))
			.sort((a, b) => a.text.localeCompare(b.text)),
		textOf: (key: string) => textByKey.get(key),
		keysOf: (values: string[]) => [
			...new Set(
				values.map(
					(value) =>
						(textByKey.has(value)
							? value
							: keyByText.get(value.toLowerCase())) ?? value,
				),
			),
		],
	};
}

export const filterPositionEnabledSchema = z.boolean();
export const FilterPosition = { ...SexualPosition, NotSpecified: -1 } as const;
export type FilterPositionId =
	(typeof FilterPosition)[keyof typeof FilterPosition];
export const filterPositionSchema = z.array(z.enum(FilterPosition));

export const filterPhotosEnabledSchema = z.boolean();
export const filterPhotosSchema = z.array(
	z.enum(["has-photos", "has-face-pics", "has-albums"]),
);

export const filterTribesEnabledSchema = z.boolean();
export const FilterTribe = { ...Tribe, NotSpecified: -1 } as const;
export type FilterTribeId = (typeof FilterTribe)[keyof typeof FilterTribe];
export const filterTribesSchema = z.array(z.enum(FilterTribe));

export const isFilterableTribe = (id: number) => id !== Tribe.Trans;

export const filterBodyTypeEnabledSchema = z.boolean();
export const FilterBodyType = { ...BodyType, NotSpecified: -1 } as const;
export type FilterBodyTypeId =
	(typeof FilterBodyType)[keyof typeof FilterBodyType];
export const filterBodyTypeSchema = z.array(z.enum(FilterBodyType));

export const HEIGHT_CM_MIN = 121;
export const HEIGHT_CM_MAX = 241;
export const WEIGHT_GRAMS_MIN = 40823;
export const WEIGHT_GRAMS_MAX = 272156;
export const weightGramsToKg = (grams: number) => Math.round(grams / 1000);
export const WEIGHT_KG_MIN = weightGramsToKg(WEIGHT_GRAMS_MIN);
export const WEIGHT_KG_MAX = weightGramsToKg(WEIGHT_GRAMS_MAX);

export const filterHeightEnabledSchema = z.boolean();
export const filterHeightSchema = rangeSchema({
	min: HEIGHT_CM_MIN,
	max: HEIGHT_CM_MAX,
});

export const filterWeightEnabledSchema = z.boolean();
export const filterWeightSchema = rangeSchema({
	min: WEIGHT_KG_MIN,
	max: WEIGHT_KG_MAX,
});

export const filterRelationshipStatusEnabledSchema = z.boolean();
export const FilterRelationshipStatus = {
	...RelationshipStatus,
	NotSpecified: -1,
} as const;
export type FilterRelationshipStatusId =
	(typeof FilterRelationshipStatus)[keyof typeof FilterRelationshipStatus];
export const filterRelationshipStatusSchema = z.array(
	z.enum(FilterRelationshipStatus),
);

export const filterAcceptNSFWPicsEnabledSchema = z.boolean();
export const FilterAcceptNSFWPics = {
	...AcceptNSFWPics,
	NotSpecified: -1,
} as const;
export type FilterAcceptNSFWPicsId =
	(typeof FilterAcceptNSFWPics)[keyof typeof FilterAcceptNSFWPics];
export const filterAcceptNSFWPicsSchema = z.array(z.enum(FilterAcceptNSFWPics));

export const filterLookingForEnabledSchema = z.boolean();
export const FilterLookingFor = { ...LookingFor, NotSpecified: -1 } as const;
export type FilterLookingForId =
	(typeof FilterLookingFor)[keyof typeof FilterLookingFor];
export const filterLookingForSchema = z.array(z.enum(FilterLookingFor));

export const filterMeetAtEnabledSchema = z.boolean();
export const FilterMeetAt = { ...MeetAt, NotSpecified: -1 } as const;
export type FilterMeetAtId = (typeof FilterMeetAt)[keyof typeof FilterMeetAt];
export const filterMeetAtSchema = z.array(z.enum(FilterMeetAt));

export const filterHaventChattedTodayEnabledSchema = z.boolean();

export const filterHealthPracticesEnabledSchema = z.boolean();
export const FilterHealthPractice = {
	...HealthPractice,
	NotSpecified: -1,
} as const;
export type FilterHealthPracticeId =
	(typeof FilterHealthPractice)[keyof typeof FilterHealthPractice];
export const filterHealthPracticesSchema = z.array(
	z.enum(FilterHealthPractice),
);

export const gridSearchFiltersSchema = z.object({
	isFavorite: filterIsFavoriteSchema.default(false),
	isOnline: filterIsOnlineSchema.default(false),
	isRightNow: filterIsRightNowSchema.default(false),

	ageEnabled: filterAgeEnabledSchema.default(false),
	age: filterAgeSchema.default([AGE_MIN, AGE_MAX]),

	genderEnabled: filterGendersEnabledSchema.default(false),
	genders: filterGendersSchema.default([]),

	tagsEnabled: filterTagsEnabledSchema.default(false),
	tags: filterTagsSchema.default([]),

	positionEnabled: filterPositionEnabledSchema.default(false),
	positions: filterPositionSchema.default([]),

	photosEnabled: filterPhotosEnabledSchema.default(false),
	photos: filterPhotosSchema.default([]),

	tribesEnabled: filterTribesEnabledSchema.default(false),
	tribes: filterTribesSchema.default([]),

	bodyTypesEnabled: filterBodyTypeEnabledSchema.default(false),
	bodyTypes: filterBodyTypeSchema.default([]),

	heightEnabled: filterHeightEnabledSchema.default(false),
	height: filterHeightSchema.default([HEIGHT_CM_MIN, HEIGHT_CM_MAX]),

	weightEnabled: filterWeightEnabledSchema.default(false),
	weight: filterWeightSchema.default([WEIGHT_KG_MIN, WEIGHT_KG_MAX]),

	relationshipStatusesEnabled:
		filterRelationshipStatusEnabledSchema.default(false),
	relationshipStatuses: filterRelationshipStatusSchema.default([]),

	acceptNSFWPicsEnabled: filterAcceptNSFWPicsEnabledSchema.default(false),
	acceptNSFWPics: filterAcceptNSFWPicsSchema.default([]),

	lookingForEnabled: filterLookingForEnabledSchema.default(false),
	lookingFor: filterLookingForSchema.default([]),

	meetAtEnabled: filterMeetAtEnabledSchema.default(false),
	meetAt: filterMeetAtSchema.default([]),

	haventChattedTodayEnabled:
		filterHaventChattedTodayEnabledSchema.default(false),

	healthPracticesEnabled: filterHealthPracticesEnabledSchema.default(false),
	healthPractices: filterHealthPracticesSchema.default([]),

	isFresh: filterIsFreshSchema.default(false),
});

export type GridSearchFilters = z.infer<typeof gridSearchFiltersSchema>;

export const defaultFilters: GridSearchFilters = gridSearchFiltersSchema.parse(
	{},
);
