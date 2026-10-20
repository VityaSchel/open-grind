const fallbackLanguage = "en";

export function searchLanguage(): string {
	try {
		return new Intl.Locale(navigator.language).language || fallbackLanguage;
	} catch {
		return fallbackLanguage;
	}
}
