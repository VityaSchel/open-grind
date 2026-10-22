const fallbackLanguage = "en";

export function systemLanguage(): string {
	try {
		return new Intl.Locale(navigator.language).language || fallbackLanguage;
	} catch {
		return fallbackLanguage;
	}
}
