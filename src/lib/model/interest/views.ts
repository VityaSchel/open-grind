import z from "zod";

import {
	profileMaskedMinSchema,
	profileMaskedSchema,
	profileMinSchema,
} from "$lib/model/profile";

export const viewPreviewSchema = z.object({
	profileImageMediaHash: profileMaskedMinSchema.shape.profileImageMediaHash,
	distance: profileMaskedMinSchema.shape.distance,
	lastViewed: profileMaskedSchema.shape.lastViewed,
	isSecretAdmirer: z.boolean(),
});

export type ViewPreview = z.infer<typeof viewPreviewSchema>;

export const viewerProfileSchema = z.object({
	...viewPreviewSchema.shape,
	profileId: profileMinSchema.shape.profileId,
	displayName: profileMinSchema.shape.displayName,
});

export type ViewerProfile = z.infer<typeof viewerProfileSchema>;
