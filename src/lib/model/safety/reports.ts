import z from "zod";

import {
	albumContentMin,
	albumPreviewSchema,
} from "#lib/model/messaging/albums.ts";
import { unixTimestampMsSchema } from "#lib/model/types.ts";

export const reportReasonSchema = z.enum([
	"SPAM",
	"HARASSMENT_BULLYING",
	"HATE_DISCRIMINATION",
	"NUDITY_PORNOGRAPHY",
	"UNDERAGE",
	"IMPERSONATION",
	"ILLEGAL_ACTIVITY",
	"SEXUAL_SOLICITATION",
	"SERIOUS_IN_PERSON_INCIDENT",
]);
export type ReportReason = z.infer<typeof reportReasonSchema>;

export const reportLocationSchema = z.enum([
	"PROFILE_PHOTO",
	"PROFILE_INFORMATION",
	"CHAT_MESSAGE",
	"ALBUM",
	"RIGHT_NOW_PHOTO",
	"RIGHT_NOW_TEXT",
]);
export type ReportLocation = z.infer<typeof reportLocationSchema>;

export const rightNowPostIdSchema = z.int();
export type RightNowPostId = z.infer<typeof rightNowPostIdSchema>;

export const profileReportRequestSchema = z.strictObject({
	reason: reportReasonSchema,
	comment: z.string(),
	locations: z.array(reportLocationSchema),
	albumInfo: z
		.strictObject({
			albumId: albumPreviewSchema.shape.albumId.optional(),
			contentId: albumContentMin.shape.contentId.optional(),
			hasVideo: z.boolean().optional(),
		})
		.optional(),
	rightNowInfo: z
		.strictObject({ postId: rightNowPostIdSchema.optional() })
		.optional(),
});
export type ProfileReportRequest = z.infer<typeof profileReportRequestSchema>;

export const profileReportRequestV2Schema = profileReportRequestSchema.extend({
	captchaToken: z.string().optional(),
});
export type ProfileReportRequestV2 = z.infer<
	typeof profileReportRequestV2Schema
>;

export const rightNowPostReportRequestSchema = profileReportRequestSchema.pick({
	reason: true,
	comment: true,
	locations: true,
});
export type RightNowPostReportRequest = z.infer<
	typeof rightNowPostReportRequestSchema
>;

export const submittedReportSchema = z.object({
	status: z.string().nullable().default(null),
	createTime: unixTimestampMsSchema.nullable().default(null),
});
export type SubmittedReport = z.infer<typeof submittedReportSchema>;

export const rightNowPostSubmittedReportResponseSchema = z.object({
	flagReport: submittedReportSchema.nullable().default(null),
});
