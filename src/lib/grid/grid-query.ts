import type z from "zod";

import {
	AGE_MAX,
	AGE_MIN,
	type GridSearchFilters,
	HEIGHT_CM_MAX,
	HEIGHT_CM_MIN,
	isFilterableGenderId,
	isFullRange,
	WEIGHT_GRAMS_MAX,
	WEIGHT_GRAMS_MIN,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import { isTribeOffered } from "$lib/model/users/profiles";
import { isTagKeyOffered } from "$lib/model/users/tags";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";

const sendable = <T>({ enabled, values }: { enabled: boolean; values: T[] }) =>
	enabled && values.length > 0 ? values : undefined;

const sendableRange = ({
	enabled,
	range,
	min,
	max,
}: {
	enabled: boolean;
	range: number[];
	min: number;
	max: number;
}) => (enabled && !isFullRange({ range, min, max }) ? range : undefined);

const weightGrams = ({
	kg,
	end,
	endGrams,
}: {
	kg: number | undefined;
	end: number;
	endGrams: number;
}) => (kg === undefined || kg === end ? endGrams : Math.round(kg * 1000));

type CascadeQuery = z.infer<typeof cascadeV4QuerySchema>;
type CascadeFilters = Omit<CascadeQuery, "nearbyGeoHash">;

export function buildCascadeQuery({
	geohash,
	filters,
	genderFilterFlag,
}: {
	geohash: string;
	filters: GridSearchFilters | null;
	genderFilterFlag: boolean;
}): CascadeQuery {
	return {
		nearbyGeoHash: geohash,
		...(filters && cascadeFilters({ filters, genderFilterFlag })),
	};
}

export function sentFilterKeys({
	filters,
	genderFilterFlag,
}: {
	filters: GridSearchFilters;
	genderFilterFlag: boolean;
}): (keyof CascadeFilters)[] {
	return Object.entries(cascadeFilters({ filters, genderFilterFlag }))
		.filter(([, value]) => value !== undefined)
		.map(([key]) => key as keyof CascadeFilters);
}

function cascadeFilters({
	filters,
	genderFilterFlag,
}: {
	filters: GridSearchFilters;
	genderFilterFlag: boolean;
}): CascadeFilters {
	const age = sendableRange({
		enabled: filters.ageEnabled,
		range: filters.age,
		min: AGE_MIN,
		max: AGE_MAX,
	});
	const height = sendableRange({
		enabled: filters.heightEnabled,
		range: filters.height,
		min: HEIGHT_CM_MIN,
		max: HEIGHT_CM_MAX,
	});
	const weight = sendableRange({
		enabled: filters.weightEnabled,
		range: filters.weight,
		min: WEIGHT_KG_MIN,
		max: WEIGHT_KG_MAX,
	});
	return {
		favorites: filters.isFavorite || undefined,
		onlineOnly: filters.isOnline || undefined,
		rightNow: filters.isRightNow || undefined,
		...(age && { ageMin: age[0], ageMax: age[1] }),
		genders: sendable({
			enabled: filters.genderEnabled,
			values: filters.genders.filter(isFilterableGenderId),
		}),
		sexualPositions: sendable({
			enabled: filters.positionEnabled,
			values: filters.positions,
		}),
		photoOnly:
			(filters.photosEnabled && filters.photos.includes("has-photos")) ||
			undefined,
		hasAlbum:
			(filters.photosEnabled && filters.photos.includes("has-albums")) ||
			undefined,
		faceOnly:
			(filters.photosEnabled &&
				filters.photos.includes("has-face-pics")) ||
			undefined,
		tribes: sendable({
			enabled: filters.tribesEnabled,
			values: filters.tribes.filter((id) =>
				isTribeOffered({ id, genderFilterFlag }),
			),
		}),
		bodyTypes: sendable({
			enabled: filters.bodyTypesEnabled,
			values: filters.bodyTypes,
		}),
		...(height && { heightCmMin: height[0], heightCmMax: height[1] }),
		...(weight && {
			weightGramsMin: weightGrams({
				kg: weight[0],
				end: WEIGHT_KG_MIN,
				endGrams: WEIGHT_GRAMS_MIN,
			}),
			weightGramsMax: weightGrams({
				kg: weight[1],
				end: WEIGHT_KG_MAX,
				endGrams: WEIGHT_GRAMS_MAX,
			}),
		}),
		relationshipStatuses: sendable({
			enabled: filters.relationshipStatusesEnabled,
			values: filters.relationshipStatuses,
		}),
		nsfwPics: sendable({
			enabled: filters.acceptNSFWPicsEnabled,
			values: filters.acceptNSFWPics,
		}),
		lookingFor: sendable({
			enabled: filters.lookingForEnabled,
			values: filters.lookingFor,
		}),
		meetAt: sendable({
			enabled: filters.meetAtEnabled,
			values: filters.meetAt,
		}),
		notRecentlyChatted: filters.haventChattedTodayEnabled || undefined,
		sexualHealth: sendable({
			enabled: filters.healthPracticesEnabled,
			values: filters.healthPractices,
		}),
		tags: sendable({
			enabled: filters.tagsEnabled,
			values: filters.tags.filter((key) =>
				isTagKeyOffered({ key, genderFilterFlag }),
			),
		}),
		fresh: filters.isFresh || undefined,
	};
}
