import z from "zod";

import { normalizeTag } from "$lib/i18n/matcher";

export const LANGUAGE_SYNC_TIERS = ["two-way", "read-only", "none"] as const;

export type LanguageSyncTier = (typeof LANGUAGE_SYNC_TIERS)[number];

export const languageTagSchema = z
	.string()
	.refine((tag) => normalizeTag(tag) !== undefined);

export const languageSyncSchema = z.object({ native: z.string().nullable() });

export type LanguageSync = z.infer<typeof languageSyncSchema>;

export type LanguageSettings = {
	readonly language: string | null;
	readonly languageSync: LanguageSync | null;
};

export type LanguagePlan = LanguageSettings & {
	readonly write: { readonly tag: string | null } | null;
};

function canonical(tag: string | null): string | null {
	return tag === null ? null : (normalizeTag(tag) ?? tag);
}

function sameTag(a: string | null, b: string | null): boolean {
	return canonical(a) === canonical(b);
}

function followNative({
	tier,
	native,
	language,
	languageSync,
}: LanguageSettings & {
	tier: Exclude<LanguageSyncTier, "none">;
	native: string | null;
}): LanguagePlan {
	const nativeChanged =
		languageSync === null
			? native !== null
			: !sameTag(native, languageSync.native);
	if (nativeChanged) {
		return { language: native, languageSync: { native }, write: null };
	}
	if (tier === "two-way" && !sameTag(language, native)) {
		return {
			language,
			languageSync: { native: language },
			write: { tag: language },
		};
	}
	return { language, languageSync: { native }, write: null };
}

export function reconcileLanguage({
	tier,
	native,
	language,
	languageSync,
	isOffered,
}: LanguageSettings & {
	tier: LanguageSyncTier;
	native: string | null;
	isOffered: (tag: string) => boolean;
}): LanguagePlan {
	const plan =
		tier === "none"
			? { language, languageSync, write: null }
			: followNative({ tier, native, language, languageSync });
	if (plan.language === null || isOffered(plan.language)) return plan;
	if (tier !== "two-way") return { ...plan, language: null };
	return {
		language: null,
		languageSync: { native: null },
		write: native === null ? null : { tag: null },
	};
}

export function planLanguageChoice({
	tier,
	tag,
	languageSync,
}: {
	tier: LanguageSyncTier;
	tag: string;
	languageSync: LanguageSync | null;
}): LanguagePlan {
	const language = canonical(tag);
	if (tier !== "two-way") return { language, languageSync, write: null };
	return {
		language,
		languageSync: { native: language },
		write: { tag: language },
	};
}
