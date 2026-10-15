import { screenshotsEnabled } from "$lib/demo/config";

export const everyLanguageOffered = import.meta.env.DEV || screenshotsEnabled;

export const everyLanguageListed = import.meta.env.DEV && !screenshotsEnabled;
