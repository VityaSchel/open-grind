import z from "zod";

const bannedTermsSchema = z
	.object({ terms: z.array(z.string()).nullish() })
	.nullish();

const bannedTermsErrorSchema = z.object({
	type: z.literal("urn:gr:err:hit_banned_terms"),
	display_name: bannedTermsSchema,
	about_me: bannedTermsSchema,
	gender_display: bannedTermsSchema,
	pronouns_display: bannedTermsSchema,
});

const moderatedFieldKeys = [
	"display_name",
	"about_me",
	"gender_display",
	"pronouns_display",
] as const;

export type ModeratedFieldKey = (typeof moderatedFieldKeys)[number];

export type ModeratedField = { field: ModeratedFieldKey; terms: string[] };

export class ProfileModerationError extends Error {
	rejected: ModeratedField[];

	constructor(rejected: ModeratedField[]) {
		super(`Banned terms in: ${rejected.map((r) => r.field).join(", ")}`);
		this.name = "ProfileModerationError";
		this.rejected = rejected;
	}
}

export function readBannedTerms(body: string): ModeratedField[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	const result = bannedTermsErrorSchema.safeParse(parsed);
	if (!result.success) return null;
	return moderatedFieldKeys
		.map((field) => ({ field, terms: result.data[field]?.terms ?? [] }))
		.filter((entry) => entry.terms.length > 0);
}
