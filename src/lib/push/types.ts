import z from "zod";

export const NOTIFICATION_MODES = ["slow", "fast"] as const;

export const notificationModeSchema = z.enum(NOTIFICATION_MODES);

export type NotificationMode = z.infer<typeof notificationModeSchema>;

export const pushTokenSchema = z.object({
	token: z.string().min(1),
	vendorProvidedIdentifier: z.string().min(1),
});

export type PushToken = z.infer<typeof pushTokenSchema>;

export const pushSignalSchema = z.object({
	deeplinkPending: z.boolean(),
	tokenChanged: z.boolean(),
});

export type PushSignal = z.infer<typeof pushSignalSchema>;

export const pushErrorSchema = z.object({
	reason: z.enum([
		"unsupportedPlatform",
		"addonUnavailable",
		"addonDisabled",
		"addonUntrusted",
		"addonRefused",
		"untrustedCaller",
		"timedOut",
		"firebaseUnavailable",
		"tokenFailed",
		"deleteFailed",
		"malformedToken",
		"failed",
	]),
	detail: z.string().nullish(),
});

export type PushErrorReason = z.infer<typeof pushErrorSchema>["reason"];
