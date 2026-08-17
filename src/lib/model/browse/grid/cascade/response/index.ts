import z from "zod";

import { mediaUrlSchema } from "$lib/model/media";
import { unixTimestampMsSchema } from "$lib/model/types";

export const cascadeResponseProfileSchema = z.object({
	profileId: z.int().nonnegative(),
	onlineUntil: unixTimestampMsSchema.nullable(),
	displayName: z.string().nullable().optional(),
	distanceMeters: z.int().nonnegative().optional(),
	lastOnline: unixTimestampMsSchema.nullable().optional(),
	rightNow: z.string(),
	unreadCount: z.int().nonnegative(),
	isVisiting: z.boolean(),
	isPopular: z.boolean(),
});

export const cascadeResponseFullProfileV1Schema = z.object({
	type: z.literal("full_profile_v1"),
	data: z.object({ ...cascadeResponseProfileSchema.shape }),
});

export const cascadeResponsePartialProfileV1Schema = z.object({
	type: z.literal("partial_profile_v1"),
	data: z.object({
		...cascadeResponseProfileSchema.shape,
		upsellItemType: z.string(),
	}),
});

export const cascadeResponseBoostUpsellV1Schema = z.object({
	type: z.literal("boost_upsell_v1"),
	data: z.object({}),
});

export const cascadeResponseUnlimitedMpuV1Schema = z.object({
	type: z.literal("unlimited_mpu_v1"),
	data: z.object({}),
});

export const cascadeResponseXtraMpuV1Schema = z.object({
	type: z.literal("xtra_mpu_v1"),
	data: z.object({}),
});

export const cascadeExploreAggregationLocationItemSchema = z.object({
	"@type": z.literal("ExploreAggregationItem$Location"),
	data: z.object({
		onlineCount: z.int().nonnegative(),
		uuid: z.string(),
		location: z.object({
			id: z.int(),
			name: z.string(),
			suffix: z.string(),
			lat: z.number(),
			lon: z.number(),
		}),
		profiles: z.array(z.object({ profileImageUrl: mediaUrlSchema })),
	}),
});

export const cascadeExploreAggregationCtaItemSchema = z.object({
	"@type": z.literal("ExploreAggregationItem$Cta"),
});

export const cascadeResponseExploreAggregationV1Schema = z.object({
	type: z.literal("explore_aggregation_v1"),
	data: z.object({
		uuid: z.string(),
		headerName: z.string(),
		source: z.string(),
		items: z.array(
			z.discriminatedUnion("@type", [
				cascadeExploreAggregationLocationItemSchema,
				cascadeExploreAggregationCtaItemSchema,
			]),
		),
	}),
});

export const cascadeResponseFavHeaderV1Schema = z.object({
	type: z.literal("favs_header_v1"),
	data: z.object({
		available: z.int().nonnegative(),
		displayed: z.int().nonnegative(),
		total: z.int().nonnegative(),
	}),
});

export const cascadeResponseAdvertV1Schema = z.object({
	type: z.literal("advert_v1"),
	data: z.object({ cascadePlacementName: z.string() }),
});

export const cascadeResponseTopPicksV1Schema = z.object({
	type: z.literal("top_picks_v1"),
	data: z.object({}),
});

export const cascadeResponseHiddenProfileV1Schema = z.object({
	...cascadeResponseFullProfileV1Schema.shape,
	type: z.literal("hidden_profile_v1"),
});

export const cascadeResponseSmartBoostProfileV1Schema = z.object({
	...cascadeResponseFullProfileV1Schema.shape,
	type: z.literal("smart_boost_profile_v1"),
});

export const cascadeResponseSponsoredProfileV1Schema = z.object({
	type: z.literal("sponsored_profile_v1"),
	data: z.object({
		cascadePlacementName: z.string(),
		alternativeProfile: cascadeResponseFullProfileV1Schema.shape.data,
	}),
});

export const cascadeResponseBrazeEventProfileV1Schema = z.object({
	type: z.literal("braze_event_profile_v1"),
	data: z.object({
		profileId: z.int().nonnegative(),
		onlineUntil: unixTimestampMsSchema.nullable().optional(),
		displayName: z.string().nullable().optional(),
		primaryImageUrl: mediaUrlSchema.nullable().optional(),
		eventName: z.string(),
	}),
});

export const cascadeResponseFavsXtraUpsellV1Schema = z.object({
	type: z.literal("favs_xtra_upsell_v1"),
	data: z.object({ available: z.int().nonnegative() }),
});

export const cascadeResponseFavsUnlimitedUpsellV1Schema = z.object({
	type: z.literal("favs_unlimited_upsell_v1"),
	data: z.object({}),
});

export const cascadeResponseFavoritesHeaderNoFreeResultsV1Schema = z.object({
	type: z.literal("favorites_header_no_free_results_v1"),
	data: z.object({}),
});

export const cascadeResponseFavoritesHeaderNoXtraResultsV1Schema = z.object({
	type: z.literal("favorites_header_no_xtra_results_v1"),
	data: z.object({}),
});

export const cascadeResponseProfileHideStatusSchema = z.object({
	type: z.literal("profile_hide_status"),
	count: z.int().nonnegative(),
});

export const cascadeResponseSchema = z.object({
	items: z.array(z.unknown()),
	nextPage: z.int().nonnegative().nullable(),
	shuffled: z.boolean(),
	hiddenProfiles: z.unknown(),
	hiddenProfileInfo: z.unknown(),
});
