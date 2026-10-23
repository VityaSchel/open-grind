import z from "zod";

export const verificationRequiredErrorSchema = z.object({
	code: z.literal(30),
	message: z.string(),
	profileId: z.string().nullish(),
});

export type VerificationRequiredError = z.infer<
	typeof verificationRequiredErrorSchema
>;

export const deprecatedClientVersionErrorSchema = z.object({
	code: z.literal(8),
	message: z.string(),
});

export type DeprecatedClientVersionError = z.infer<
	typeof deprecatedClientVersionErrorSchema
>;

export const accountStatusErrorSchema = z.discriminatedUnion("code", [
	verificationRequiredErrorSchema,
	deprecatedClientVersionErrorSchema,
]);

export type AccountStatusError = z.infer<typeof accountStatusErrorSchema>;

export const banSubReasonSchema = z.enum([
	"UNDERAGE_ACCESS",
	"UNDERAGE_IMPERSONATION",
	"CHILD_ENDANGERMENT",
	"UNWANTED_MESSAGING",
	"PROFILE_SPAM",
	"PHISHING_AND_FRAUD",
	"BOT_ACTIVITY",
	"DRUG_SALES",
	"FREQUENT_DRUG_SOLICITATION",
	"OCCASIONAL_DRUG_SOLICITATION",
	"DRUG_PROMOTION",
	"NON_ILLICIT_SUBSTANCES",
	"PAID_SEXUAL_SERVICES",
	"MILD_SOLICITATION",
	"SALE_OF_SEXUAL_CONTENT",
	"MILD_INSULTS",
	"BULLYING",
	"HATE_SPEECH",
	"BLACKMAIL_AND_THREATS",
	"PRIVACY_VIOLATIONS",
	"IMPERSONATION",
	"CONSENT_VIOLATIONS",
	"OFFLINE_INCIDENTS",
	"GENERAL_ADVERTISING",
	"BUSINESS_SOLICITATION",
	"TRANSACTIONAL_SERVICES",
	"SCAMS_AND_PROMOTIONS",
	"DRUG_SEEKING",
	"DRUG_FACILITATION",
	"NON_CONSENSUAL_INTIMATE_IMAGERY",
	"SEXTORTION",
	"BLOCK_DECISION",
	"Other",
]);
export type BanSubReason = z.infer<typeof banSubReasonSchema>;
