import z from "zod";

import {
	acceptNSFWPicsSchema,
	BodyType,
	HealthPractice,
	LookingFor,
	MeetAt,
	RelationshipStatus,
	SexualPosition,
	Tribe,
} from "$lib/model/profile";

export const filterIsFavoriteSchema = z.boolean();
export const filterIsOnlineSchema = z.boolean();
export const filterIsRightNowSchema = z.boolean();
export const filterIsFreshSchema = z.boolean();

export const filterAgeEnabledSchema = z.boolean();
export const filterAgeSchema = z.array(z.number().min(18).max(102)).length(2);

export const filterGendersEnabledSchema = z.boolean();
export const filterGendersSchema = z.array(z.number().int().nonnegative());

export const filterTagsEnabledSchema = z.boolean();
export const filterTagsSchema = z.string();

export const filterPositionEnabledSchema = z.boolean();
export const FilterPosition = {
	...SexualPosition,
	NotSpecified: -1,
} as const;
export type FilterPositionId =
	(typeof FilterPosition)[keyof typeof FilterPosition];
export const filterPositionSchema = z.array(z.enum(FilterPosition));

export const filterPhotosEnabledSchema = z.boolean();
export const filterPhotosSchema = z.array(
	z.enum(["has-photos", "has-face-pics", "has-albums"]),
);

export const filterTribesEnabledSchema = z.boolean();
export const FilterTribe = {
	...Tribe,
	NotSpecified: -1,
} as const;
export type FilterTribeId = (typeof FilterTribe)[keyof typeof FilterTribe];
export const filterTribesSchema = z.array(z.enum(FilterTribe));

export const filterBodyTypeEnabledSchema = z.boolean();
export const FilterBodyType = {
	...BodyType,
	NotSpecified: -1,
} as const;
export type FilterBodyTypeId =
	(typeof FilterBodyType)[keyof typeof FilterBodyType];
export const filterBodyTypeSchema = z.array(z.enum(FilterBodyType));

export const filterHeightEnabledSchema = z.boolean();
export const filterHeightSchema = z
	.array(z.number().min(120).max(242))
	.length(2);

export const filterWeightEnabledSchema = z.boolean();
export const filterWeightSchema = z
	.array(z.number().min(40).max(273))
	.length(2);

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
export const filterAcceptNSFWPicsSchema = z.array(acceptNSFWPicsSchema);

export const filterLookingForEnabledSchema = z.boolean();
export const FilterLookingFor = {
	...LookingFor,
	NotSpecified: -1,
} as const;
export type FilterLookingForId =
	(typeof FilterLookingFor)[keyof typeof FilterLookingFor];
export const filterLookingForSchema = z.array(z.enum(FilterLookingFor));

export const filterMeetAtEnabledSchema = z.boolean();
export const FilterMeetAt = {
	...MeetAt,
	NotSpecified: -1,
} as const;
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
	isFavorite: filterIsFavoriteSchema,
	isOnline: filterIsOnlineSchema,
	isRightNow: filterIsRightNowSchema,

	ageEnabled: filterAgeEnabledSchema,
	age: filterAgeSchema,

	genderEnabled: filterGendersEnabledSchema,
	genders: filterGendersSchema,

	tagsEnabled: filterTagsEnabledSchema,
	tags: filterTagsSchema,

	positionEnabled: filterPositionEnabledSchema,
	positions: filterPositionSchema,

	photosEnabled: filterPhotosEnabledSchema,
	photos: filterPhotosSchema,

	tribesEnabled: filterTribesEnabledSchema,
	tribes: filterTribesSchema,

	bodyTypesEnabled: filterBodyTypeEnabledSchema,
	bodyTypes: filterBodyTypeSchema,

	heightEnabled: filterHeightEnabledSchema,
	height: filterHeightSchema,

	weightEnabled: filterWeightEnabledSchema,
	weight: filterWeightSchema,

	relationshipStatusesEnabled: filterRelationshipStatusEnabledSchema,
	relationshipStatuses: filterRelationshipStatusSchema,

	acceptNSFWPicsEnabled: filterAcceptNSFWPicsEnabledSchema,
	acceptNSFWPics: filterAcceptNSFWPicsSchema,

	lookingForEnabled: filterLookingForEnabledSchema,
	lookingFor: filterLookingForSchema,

	meetAtEnabled: filterMeetAtEnabledSchema,
	meetAt: filterMeetAtSchema,

	haventChattedTodayEnabled: filterHaventChattedTodayEnabledSchema,

	healthPracticesEnabled: filterHealthPracticesEnabledSchema,
	healthPractices: filterHealthPracticesSchema,

	isFresh: filterIsFreshSchema,
});

export type GridSearchFilters = z.infer<typeof gridSearchFiltersSchema>;

export const defaultFilters: GridSearchFilters = {
	isFavorite: false,
	isOnline: false,
	isRightNow: false,

	ageEnabled: false,
	age: [18, 102],

	genderEnabled: false,
	genders: [],

	tagsEnabled: false,
	tags: "",

	positionEnabled: false,
	positions: [],

	photosEnabled: false,
	photos: [],

	tribesEnabled: false,
	tribes: [],

	bodyTypesEnabled: false,
	bodyTypes: [],

	heightEnabled: false,
	height: [120, 242],

	weightEnabled: false,
	weight: [40, 273],

	relationshipStatusesEnabled: false,
	relationshipStatuses: [],

	acceptNSFWPicsEnabled: false,
	acceptNSFWPics: [],

	lookingForEnabled: false,
	lookingFor: [],

	meetAtEnabled: false,
	meetAt: [],

	haventChattedTodayEnabled: false,

	healthPracticesEnabled: false,
	healthPractices: [],

	isFresh: false,
} satisfies GridSearchFilters;
