import z from "zod";

export const notificationModeSchema = z.enum(["slow", "fast"]);

export type NotificationMode = z.infer<typeof notificationModeSchema>;

export const pushCategorySchema = z.object({
	category: z.enum(["messages", "taps"]),
	enabled: z.boolean(),
	systemBlocked: z.boolean(),
});

export type PushCategory = z.infer<typeof pushCategorySchema>;

export type PushCategoryName = PushCategory["category"];

export const notificationPermissionSchema = z.object({
	granted: z.boolean(),
	state: z
		.enum(["granted", "denied", "prompt", "prompt-with-rationale"])
		.catch("denied"),
});

export type NotificationPermission = z.infer<
	typeof notificationPermissionSchema
>;

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
