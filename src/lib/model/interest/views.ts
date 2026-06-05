import z from "zod";

import {
	profileMaskedMinSchema,
	profileMaskedSchema,
	profileMinSchema,
} from "$lib/model/profile";

export const viewPreviewSchema = z.object({
	profileImageMediaHash: profileMaskedMinSchema.shape.profileImageMediaHash,
	distance: profileMaskedMinSchema.shape.distance,
	isFavorite: profileMaskedMinSchema.shape.isFavorite,
	lastViewed: profileMaskedSchema.shape.lastViewed,
	isSecretAdmirer: z.boolean(),
	viewedCount: z.object({
		totalCount: z.number().int().nonnegative(),
		maxDisplayCount: z.number().int().nonnegative(),
	}),
});

export type ViewPreview = z.infer<typeof viewPreviewSchema>;

export const viewerProfileSchema = z.object({
	...viewPreviewSchema.shape,
	profileId: profileMinSchema.shape.profileId,
	displayName: profileMinSchema.shape.displayName,
	onlineUntil: profileMinSchema.shape.onlineUntil,
});

export type ViewerProfile = z.infer<typeof viewerProfileSchema>;
