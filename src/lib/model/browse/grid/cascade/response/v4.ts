import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { arrayOfKnownVariants, knownValueOrNull } from "$lib/model/tolerance";
import {
	bodyTypeSchema,
	sexualPositionSchema,
} from "$lib/model/users/profiles";
import {
	cascadeResponseAdvertV1Schema,
	cascadeResponseBoostUpsellV1Schema,
	cascadeResponseBrazeEventProfileV1Schema,
	cascadeResponseExploreAggregationV1Schema,
	cascadeResponseFavHeaderV1Schema,
	cascadeResponseFavoritesHeaderNoFreeResultsV1Schema,
	cascadeResponseFavoritesHeaderNoXtraResultsV1Schema,
	cascadeResponseFavsUnlimitedUpsellV1Schema,
	cascadeResponseFavsXtraUpsellV1Schema,
	cascadeResponseFullProfileV1Schema,
	cascadeResponsePartialProfileV1Schema,
	cascadeResponseProfileHideStatusSchema,
	cascadeResponseProfileSchema,
	cascadeResponseRewardedProfilesEntryPointV1Schema,
	cascadeResponseSchema,
	cascadeResponseSponsoredProfileV1Schema,
	cascadeResponseTopPicksV1Schema,
	cascadeResponseUnlimitedMpuV1Schema,
	cascadeResponseXtraMpuV1Schema,
} from ".";

const cascadeV4ResponseProfileSchema = z.object({
	...cascadeResponseProfileSchema.shape,
	primaryImageUrl: mediaUrlSchema.nullish(),
	favorite: z.boolean().optional(),
	viewed: z.boolean().optional(),
	chatted: z.boolean().optional(),
	roaming: z.boolean().optional(),
});

export const cascadeV4ResponseFullProfileV1Schema = z.object({
	...cascadeResponseFullProfileV1Schema.shape,
	data: z.object({
		...cascadeResponseFullProfileV1Schema.shape.data.shape,
		...cascadeV4ResponseProfileSchema.shape,
		age: z.int().nonnegative().optional(),
		heightCm: z.number().nonnegative().optional(),
		weightGrams: z.number().nonnegative().optional(),
		bodyType: knownValueOrNull({
			value: bodyTypeSchema,
			label: "cascade bodyType",
		}).optional(),
		sexualPosition: knownValueOrNull({
			value: sexualPositionSchema,
			label: "cascade sexualPosition",
		}).optional(),
	}),
});

export const cascadeV4ResponseAdvertV1Schema = z.object({
	...cascadeResponseAdvertV1Schema.shape,
});

export const cascadeV4ResponseTopPicksV1Schema = z.object({
	...cascadeResponseTopPicksV1Schema.shape,
});

export const cascadeV4ResponsePartialProfileV1Schema = z.object({
	...cascadeResponsePartialProfileV1Schema.shape,
	data: z.object({
		...cascadeResponsePartialProfileV1Schema.shape.data.shape,
		...cascadeV4ResponseProfileSchema.shape,
	}),
});

export const cascadeV4ResponseExploreAggregationV1Schema = z.object({
	...cascadeResponseExploreAggregationV1Schema.shape,
});

export const cascadeV4ResponseBoostUpsellV1Schema = z.object({
	...cascadeResponseBoostUpsellV1Schema.shape,
});

export const cascadeV4ResponseUnlimitedMpuV1Schema = z.object({
	...cascadeResponseUnlimitedMpuV1Schema.shape,
});

export const cascadeV4ResponseXtraMpuV1Schema = z.object({
	...cascadeResponseXtraMpuV1Schema.shape,
});

export const cascadeV4ResponseFavHeaderV1Schema = z.object({
	...cascadeResponseFavHeaderV1Schema.shape,
});

export const cascadeV4ResponseHiddenProfileV1Schema = z.object({
	...cascadeV4ResponseFullProfileV1Schema.shape,
	type: z.literal("hidden_profile_v1"),
});

export const cascadeV4ResponseSmartBoostProfileV1Schema = z.object({
	...cascadeV4ResponseFullProfileV1Schema.shape,
	type: z.literal("smart_boost_profile_v1"),
});

export const cascadeV4ResponseSponsoredProfileV1Schema = z.object({
	...cascadeResponseSponsoredProfileV1Schema.shape,
	data: z.object({
		...cascadeResponseSponsoredProfileV1Schema.shape.data.shape,
		alternativeProfile: cascadeV4ResponseFullProfileV1Schema.shape.data,
	}),
});

export const cascadeV4ResponseBrazeEventProfileV1Schema = z.object({
	...cascadeResponseBrazeEventProfileV1Schema.shape,
});

export const cascadeV4ResponseFavsXtraUpsellV1Schema = z.object({
	...cascadeResponseFavsXtraUpsellV1Schema.shape,
});

export const cascadeV4ResponseFavsUnlimitedUpsellV1Schema = z.object({
	...cascadeResponseFavsUnlimitedUpsellV1Schema.shape,
});

export const cascadeV4ResponseFavoritesHeaderNoFreeResultsV1Schema = z.object({
	...cascadeResponseFavoritesHeaderNoFreeResultsV1Schema.shape,
});

export const cascadeV4ResponseFavoritesHeaderNoXtraResultsV1Schema = z.object({
	...cascadeResponseFavoritesHeaderNoXtraResultsV1Schema.shape,
});

export const cascadeV4ResponseProfileHideStatusSchema = z.object({
	...cascadeResponseProfileHideStatusSchema.shape,
});

export const cascadeV4ResponseRewardedProfilesEntryPointV1Schema = z.object({
	...cascadeResponseRewardedProfilesEntryPointV1Schema.shape,
});

export const cascadeV4ResponseItemSchema = z.discriminatedUnion("type", [
	cascadeV4ResponseFullProfileV1Schema,
	cascadeV4ResponsePartialProfileV1Schema,
	cascadeV4ResponseAdvertV1Schema,
	cascadeV4ResponseTopPicksV1Schema,
	cascadeV4ResponseExploreAggregationV1Schema,
	cascadeV4ResponseBoostUpsellV1Schema,
	cascadeV4ResponseUnlimitedMpuV1Schema,
	cascadeV4ResponseXtraMpuV1Schema,
	cascadeV4ResponseFavHeaderV1Schema,
	cascadeV4ResponseHiddenProfileV1Schema,
	cascadeV4ResponseSmartBoostProfileV1Schema,
	cascadeV4ResponseSponsoredProfileV1Schema,
	cascadeV4ResponseBrazeEventProfileV1Schema,
	cascadeV4ResponseFavsXtraUpsellV1Schema,
	cascadeV4ResponseFavsUnlimitedUpsellV1Schema,
	cascadeV4ResponseFavoritesHeaderNoFreeResultsV1Schema,
	cascadeV4ResponseFavoritesHeaderNoXtraResultsV1Schema,
	cascadeV4ResponseProfileHideStatusSchema,
	cascadeV4ResponseRewardedProfilesEntryPointV1Schema,
]);

export const cascadeV4ResponseSchema = z.object({
	...cascadeResponseSchema.shape,
	items: arrayOfKnownVariants({
		variants: cascadeV4ResponseItemSchema,
		label: "cascade",
	}),
});
