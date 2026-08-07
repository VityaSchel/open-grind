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

const moderatedFieldLabels: Record<
	(typeof moderatedFieldKeys)[number],
	string
> = {
	display_name: "Display name",
	about_me: "About me",
	gender_display: "Gender",
	pronouns_display: "Pronouns",
};

export type ModeratedField = { field: string; terms: string[] };

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
		.map((key) => ({
			field: moderatedFieldLabels[key],
			terms: result.data[key]?.terms ?? [],
		}))
		.filter((entry) => entry.terms.length > 0);
}
