export type LanguageName = {
	readonly catalog: string;
	readonly english: string;
	readonly own: string;
};

export const LANGUAGE_NAMES: readonly LanguageName[] = [
	{ catalog: "ar", english: "Arabic", own: "العربية" },
	{
		catalog: "ar-XB",
		english: "Arabic (Pseudo-Bidi)",
		own: "Arabic (Pseudo-Bidi)",
	},
	{
		catalog: "zh-Hans",
		english: "Chinese (Simplified)",
		own: "中文（简体）",
	},
	{
		catalog: "zh-Hant",
		english: "Chinese (Traditional)",
		own: "中文（繁體）",
	},
	{ catalog: "cs", english: "Czech", own: "Čeština" },
	{ catalog: "da", english: "Danish", own: "Dansk" },
	{ catalog: "nl", english: "Dutch", own: "Nederlands" },
	{ catalog: "en-XM", english: "English (Key Markers)", own: "English" },
	{
		catalog: "en-XA",
		english: "English (Pseudo-Accents)",
		own: "English (Pseudo-Accents)",
	},
	{
		catalog: "en-GB",
		english: "English (United Kingdom)",
		own: "English (United Kingdom)",
	},
	{ catalog: "en", english: "English (United States)", own: "English" },
	{ catalog: "fil", english: "Filipino", own: "Filipino" },
	{ catalog: "fr", english: "French", own: "Français" },
	{ catalog: "de", english: "German", own: "Deutsch" },
	{ catalog: "hi", english: "Hindi", own: "हिन्दी" },
	{ catalog: "id", english: "Indonesian", own: "Indonesia" },
	{ catalog: "it", english: "Italian", own: "Italiano" },
	{ catalog: "ja", english: "Japanese", own: "日本語" },
	{ catalog: "ko", english: "Korean", own: "한국어" },
	{ catalog: "ms", english: "Malay", own: "Melayu" },
	{ catalog: "nb", english: "Norwegian Bokmål", own: "Norsk bokmål" },
	{ catalog: "pl", english: "Polish", own: "Polski" },
	{
		catalog: "pt-BR",
		english: "Portuguese (Brazil)",
		own: "Português (Brasil)",
	},
	{
		catalog: "pt-PT",
		english: "Portuguese (Portugal)",
		own: "Português (Portugal)",
	},
	{ catalog: "ru", english: "Russian", own: "Русский" },
	{
		catalog: "es-419",
		english: "Spanish (Latin America)",
		own: "Español (Latinoamérica)",
	},
	{ catalog: "es", english: "Spanish (Spain)", own: "Español (España)" },
	{ catalog: "sv", english: "Swedish", own: "Svenska" },
	{ catalog: "th", english: "Thai", own: "ไทย" },
	{ catalog: "uk", english: "Ukrainian", own: "Українська" },
	{ catalog: "vi", english: "Vietnamese", own: "Tiếng Việt" },
];

export function languageNamesOf(
	catalogs: readonly string[],
): readonly LanguageName[] {
	return LANGUAGE_NAMES.filter(({ catalog }) => catalogs.includes(catalog));
}

export function languageName(catalog: string): LanguageName {
	return (
		LANGUAGE_NAMES.find((name) => name.catalog === catalog) ?? {
			catalog,
			english: catalog,
			own: catalog,
		}
	);
}
