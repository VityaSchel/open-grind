import type z from "zod";

import {
	type GridSearchFilters,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import type { cascadeV4QuerySchema } from "$lib/model/browse/grid/cascade/query/v4";

export function buildCascadeQuery({
	geohash,
	filters,
}: {
	geohash: string;
	filters: GridSearchFilters | null;
}): z.infer<typeof cascadeV4QuerySchema> {
	if (!filters) return { nearbyGeoHash: geohash };
	return {
		nearbyGeoHash: geohash,
		favorites: filters.isFavorite || undefined,
		onlineOnly: filters.isOnline || undefined,
		rightNow: filters.isRightNow || undefined,
		...(filters.ageEnabled && {
			ageMin: filters.age[0],
			ageMax: filters.age[1],
		}),
		...(filters.genderEnabled && { genders: filters.genders }),
		...(filters.positionEnabled && { sexualPositions: filters.positions }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-photos") && { photoOnly: true }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-albums") && { hasAlbum: true }),
		...(filters.photosEnabled &&
			filters.photos.includes("has-face-pics") && { faceOnly: true }),
		...(filters.tribesEnabled && { tribes: filters.tribes }),
		...(filters.bodyTypesEnabled && { bodyTypes: filters.bodyTypes }),
		...(filters.heightEnabled && {
			heightCmMin: filters.height[0],
			heightCmMax: filters.height[1],
		}),
		...(filters.weightEnabled && {
			weightGramsMin: (filters.weight[0] ?? WEIGHT_KG_MIN) * 1000,
			weightGramsMax: (filters.weight[1] ?? WEIGHT_KG_MAX) * 1000,
		}),
		...(filters.relationshipStatusesEnabled && {
			relationshipStatuses: filters.relationshipStatuses,
		}),
		...(filters.acceptNSFWPicsEnabled &&
			filters.acceptNSFWPics !== undefined && {
				nsfwPics: filters.acceptNSFWPics,
			}),
		...(filters.lookingForEnabled && { lookingFor: filters.lookingFor }),
		...(filters.meetAtEnabled && { meetAt: filters.meetAt }),
		notRecentlyChatted: filters.haventChattedTodayEnabled || undefined,
		...(filters.healthPracticesEnabled && {
			sexualHealth: filters.healthPractices,
		}),
		...(filters.tagsEnabled && filters.tags && { tags: filters.tags }),
		fresh: filters.isFresh || undefined,
	};
}
