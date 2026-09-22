export const APP_COMPONENT = "app";
export const GOOGLE_OAUTH_COMPONENT = "google-oauth";
export const RECAPTCHA_COMPONENT = "recaptcha";
export const FCM_COMPONENT = "fcm";

export const ADDON_KEYS = [
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
	FCM_COMPONENT,
] as const;

export const COMPONENT_KEYS = [APP_COMPONENT, ...ADDON_KEYS] as const;

export type AddonKey = (typeof ADDON_KEYS)[number];
export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export const COMPONENT_PACKAGE = {
	[APP_COMPONENT]: "org.opengrind",
	[GOOGLE_OAUTH_COMPONENT]: "org.opengrind.google_oauth",
	[RECAPTCHA_COMPONENT]: "org.opengrind.recaptcha",
	[FCM_COMPONENT]: "org.opengrind.fcm",
} as const satisfies Record<ComponentKey, string>;

export const COMPONENT_REPO = {
	[APP_COMPONENT]: "https://git.opengrind.org/open-grind/open-grind",
	[GOOGLE_OAUTH_COMPONENT]:
		"https://git.opengrind.org/open-grind/google-oauth-app",
	[RECAPTCHA_COMPONENT]:
		"https://git.opengrind.org/open-grind/recaptcha-helper",
	[FCM_COMPONENT]: "https://git.opengrind.org/open-grind/fcm-service",
} as const satisfies Record<ComponentKey, string>;

export const ADDON_NAME = {
	[GOOGLE_OAUTH_COMPONENT]: "Google OAuth app",
	[RECAPTCHA_COMPONENT]: "reCAPTCHA helper",
	[FCM_COMPONENT]: "FCM service",
} as const satisfies Record<AddonKey, string>;
