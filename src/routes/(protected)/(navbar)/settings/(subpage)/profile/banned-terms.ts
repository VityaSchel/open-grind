import { type PlainMessageKey, t } from "$lib/i18n";
import { formatList } from "$lib/i18n/format";
import type {
	ModeratedField,
	ModeratedFieldKey,
} from "$lib/api/users/profile-moderation";

const fieldNameKeys = {
	display_name: "settings.profile.fields.displayName",
	about_me: "settings.profile.fields.aboutMe",
	gender_display: "settings.profile.fields.gender",
	pronouns_display: "settings.profile.fields.pronouns",
} as const satisfies Record<ModeratedFieldKey, PlainMessageKey>;

export function bannedTermsDetail(rejected: readonly ModeratedField[]): string {
	const [first, ...rest] = rejected.map(({ field, terms }) =>
		t("settings.profile.errors.bannedTermsField", {
			field: t(fieldNameKeys[field]),
			terms: formatList(terms),
		}),
	);
	return rest.reduce(
		(entries, entry) =>
			t("settings.profile.errors.bannedTermsEntries", { entries, entry }),
		first ?? "",
	);
}
