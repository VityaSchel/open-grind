import z from "zod";

export const notificationModeSchema = z.enum(["slow", "fast"]);

export type NotificationMode = z.infer<typeof notificationModeSchema>;

export const fastSourceSchema = z.enum(["addon", "relay"]);

export type FastSource = z.infer<typeof fastSourceSchema>;

export const relayStatusSchema = z.object({
	paired: z.boolean(),
	broken: z.boolean(),
});

export type RelayStatus = z.infer<typeof relayStatusSchema>;

export const relayCommitSchema = z.object({ matched: z.boolean() });

export type RelayCommit = z.infer<typeof relayCommitSchema>;

export const pushCategorySchema = z.object({
	category: z.enum(["messages", "taps"]),
	enabled: z.boolean(),
	systemBlocked: z.boolean(),
});

export type PushCategory = z.infer<typeof pushCategorySchema>;

export type PushCategoryName = PushCategory["category"];

export type Announcement = {
	category: PushCategoryName;
	tag: string;
	messageId: string | null;
	title: string;
	body: string;
	deeplink: string;
};

export const notificationPermissionSchema = z.object({
	granted: z.boolean(),
	state: z
		.enum(["granted", "denied", "prompt", "prompt-with-rationale"])
		.catch("denied"),
});

export type NotificationPermission = z.infer<
	typeof notificationPermissionSchema
>;

export const TAP_TAG_PREFIX = "tap:";

export const shownConversationsSchema = z.string().array();

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
		"addonOutdated",
		"addonHidden",
		"addonTurnedOff",
		"addonBlocked",
		"untrustedCaller",
		"timedOut",
		"firebaseUnavailable",
		"tokenFailed",
		"deleteFailed",
		"malformedToken",
		"fastUnconfigured",
		"relayNoDistributor",
		"relayDistributorUnavailable",
		"relayActionRequired",
		"relayVapidRequired",
		"relayNetwork",
		"relayRegistrationFailed",
		"relayTimedOut",
		"relayCancelled",
		"relaySetupLost",
		"relayNoSetup",
		"relayUnpaired",
		"relayRegisterFailed",
		"relayAccountChanged",
		"relaySaveFailed",
		"relayShareFailed",
		"failed",
	]),
	detail: z.string().nullish(),
});

export type PushErrorReason = z.infer<typeof pushErrorSchema>["reason"];
