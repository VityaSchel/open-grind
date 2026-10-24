import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import {
	ApiError,
	type ApiErrorKind,
	apiErrorKinds,
	apiErrorMessageKeys,
	httpStatusOf,
} from "$lib/api/api-error";
import { capText } from "$lib/api/redact/text";
import { summariseNonJson } from "$lib/api/redact/value";
import {
	requestBlockedAlertState,
	type RequestBlockKind,
} from "$lib/api/request-blocked-state.svelte";
import { demo, demoEnabled, screenshotsEnabled } from "$lib/demo";
import {
	type MessageKey,
	type PlainMessageKey,
	sourceText,
	t,
	type Translate,
} from "$lib/i18n";
import { formatInteger } from "$lib/i18n/format";
import {
	type AccountStatusError,
	accountStatusErrorSchema,
} from "$lib/model/authentication";
import { geohashSchema } from "$lib/model/geohash";
import { BYTES_PER_MEGABYTE } from "$lib/util/bytes";

const maxPrettyMessageChars = 200;

const messagelessMessageKeys = {
	RequestBlocked: apiErrorMessageKeys.RequestBlocked,
	NetworkBlocked: apiErrorMessageKeys.NetworkBlocked,
	SessionStale: apiErrorMessageKeys.SessionStale,
	RateLimited: "feedback.appError.rateLimited",
	NotSignedIn: "feedback.appError.notSignedIn",
	ContentTooLarge: "feedback.appError.contentTooLarge",
} as const satisfies Partial<Record<ApiErrorKind, MessageKey>>;

type MessagelessMessageKey =
	| (typeof messagelessMessageKeys)[keyof typeof messagelessMessageKeys]
	| "feedback.appError.unknown";

const appErrorSchema = z.object({
	kind: z.enum(apiErrorKinds),
	message: z
		.string()
		.or(z.object({ code: z.number(), message: z.string() }))
		.or(
			z.object({
				reason: z.string(),
				detail: z.string().nullish(),
				maxBytes: z.number().optional(),
			}),
		)
		.optional(),
});

type AppError = z.infer<typeof appErrorSchema>;

const namedMediaReasons = [
	"notMedia",
	"linkNotMedia",
	"linkTooLarge",
	"videoUnreadable",
	"notAPhoto",
	"photoSizeUnreadable",
	"photoDamaged",
	"heicUnsupported",
	"photoUndecodable",
	"outsideReadableFolders",
] as const;

type NamedMediaReason = (typeof namedMediaReasons)[number];

const mediaReasonMessageKeys = {
	notMedia: "common.media.errors.unsupportedFile",
	linkNotMedia: "common.media.errors.linkNotMedia",
	linkTooLarge: "common.media.errors.linkTooLarge",
	videoUnreadable: "common.media.errors.videoUnreadable",
	notAPhoto: "common.media.errors.notAPhoto",
	photoSizeUnreadable: "common.media.errors.photoSizeUnreadable",
	photoDamaged: "common.media.errors.photoDamaged",
	heicUnsupported: "common.media.errors.heicUnsupported",
	photoUndecodable: "common.media.errors.photoUndecodable",
	outsideReadableFolders: "common.media.errors.outsideReadableFolders",
} as const satisfies Record<NamedMediaReason, PlainMessageKey>;

const mediaRefusalSchema = z.discriminatedUnion("reason", [
	z.object({ reason: z.enum(namedMediaReasons) }),
	z.object({
		reason: z.literal("photoTooLarge"),
		maxBytes: z.int().positive(),
	}),
]);

type MediaRefusal = z.infer<typeof mediaRefusalSchema>;

const mediaRefusalErrorSchema = z.object({
	kind: z.literal("Media"),
	message: mediaRefusalSchema,
});

type Wording = {
	translate: Translate;
	formatInteger: (value: number) => string;
};

const shownWording: Wording = { translate: t, formatInteger };

const diagnosticWording: Wording = {
	translate: sourceText,
	formatInteger: String,
};

export const banInfoSchema = z.object({
	kind: z.enum(["profile", "device", "network", "underage", "unknown"]),
	code: z.number(),
	message: z.string(),
	reason: z.string().nullish(),
	subReason: z.string().nullish(),
	automated: z.boolean().nullish(),
});
export type BanInfo = z.infer<typeof banInfoSchema>;

export const restrictionSchema = z.object({
	kind: z.enum([
		"ageVerification",
		"timedBan",
		"trustVendorRejected",
		"other",
	]),
	region: z.string().nullish(),
	reason: z.string().nullish(),
	subReason: z.string().nullish(),
	endsAt: z.int().nullish(),
});
export type Restriction = z.infer<typeof restrictionSchema>;

export const signInResultSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	restriction: restrictionSchema.nullish(),
});

export const methods = {
	sign_in_with_email: {
		request: z.object({
			email: z.email(),
			password: z.string().min(1),
			captchaToken: z.string().optional(),
		}),
		response: signInResultSchema,
	},
	sign_in_with_google: {
		request: z.undefined(),
		response: signInResultSchema,
	},
	sign_in_with_google_token: {
		request: z.object({ token: z.string().min(1) }),
		response: signInResultSchema,
	},
	sign_in_with_facebook: {
		request: z.undefined(),
		response: signInResultSchema,
	},
	account_restriction: {
		request: z.undefined(),
		response: restrictionSchema.nullish(),
	},
	session_feature_flags: {
		request: z.undefined(),
		response: z.array(z.string()),
	},
	storage_backend: {
		request: z.undefined(),
		response: z.enum(["keyring", "file", "unavailable"]),
	},
	refresh_session: {
		request: z.object({ geohash: geohashSchema.optional() }).optional(),
		response: signInResultSchema,
	},
	rotate_api_params: {
		request: z.undefined(),
		response: z.object({
			"user-agent": z.string(),
			"l-device-info": z.string(),
		}),
	},
	sign_out: { request: z.undefined(), response: z.null() },
	recaptcha_first_party_enabled: {
		request: z.undefined(),
		response: z.boolean(),
	},
	mint_recaptcha_token: {
		request: z.object({
			action: z.enum([
				"sign_up",
				"login",
				"forgot_password",
				"report",
				"decision_appeal",
				"device_key_registration",
			]),
		}),
		response: z.string().min(1),
	},
	current_session: {
		request: z.undefined(),
		response: z.object({
			profileId: z.int().nonnegative().nullable(),
			expiresAt: z.int().nonnegative().nullable(),
			stale: z.boolean(),
		}),
	},
	set_app_active: {
		request: z.object({ active: z.boolean() }),
		response: z.null(),
	},
} satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

function demoMethodAnswer(method: string): unknown {
	const { demoCallMethod, neverSettles, sceneMethodOutcome } = demo();
	const scripted = screenshotsEnabled
		? sceneMethodOutcome(method)
		: undefined;
	if (scripted === undefined) return demoCallMethod(method);
	// eslint-disable-next-line @typescript-eslint/only-throw-error -- Tauri commands reject with the bare AppError object
	if ("error" in scripted) throw scripted.error;
	return "pending" in scripted ? neverSettles() : scripted.answer;
}

type MethodResult<T extends keyof typeof methods> = z.infer<
	(typeof methods)[T]["response"]
>;

async function parseAnswer<T extends keyof typeof methods>({
	method,
	answer,
}: {
	method: T;
	answer: () => unknown;
}): Promise<MethodResult<T>> {
	try {
		return methods[method].response.parse(
			await answer(),
		) as MethodResult<T>;
	} catch (error) {
		const kind = blockedKindOf(asAppError(error)?.kind);
		if (kind !== undefined) {
			markRequestBlocked({ kind });
		}
		throw error;
	}
}

export async function callMethod<T extends keyof typeof methods>(
	method: T,
	...args: undefined extends z.infer<(typeof methods)[T]["request"]>
		? [data?: z.infer<(typeof methods)[T]["request"]>]
		: [data: z.infer<(typeof methods)[T]["request"]>]
): Promise<MethodResult<T>> {
	if (demoEnabled) {
		return parseAnswer({ method, answer: () => demoMethodAnswer(method) });
	}
	return parseAnswer({ method, answer: () => invoke(method, args[0]) });
}

export function markRequestBlocked({
	kind,
}: {
	kind: RequestBlockKind;
}): boolean {
	if (requestBlockedAlertState.disable) return false;
	requestBlockedAlertState.open = true;
	requestBlockedAlertState.kind = kind;
	return true;
}

export function blockedKindOf(
	kind: ApiErrorKind | undefined,
): RequestBlockKind | undefined {
	if (kind === "RequestBlocked") return "cloudflare";
	if (kind === "NetworkBlocked") return "network";
	return undefined;
}

export function asBanned(error: unknown): BanInfo | null {
	const parsed = z
		.object({ kind: z.literal("Banned"), message: banInfoSchema })
		.safeParse(error);
	return parsed.success ? parsed.data.message : null;
}

export function asAccountStatusError(
	error: unknown,
): AccountStatusError | null {
	const parsed = z
		.object({ kind: z.literal("Api"), message: accountStatusErrorSchema })
		.safeParse(error);
	return parsed.success ? parsed.data.message : null;
}

function messagelessMessageKey(kind: ApiErrorKind): MessagelessMessageKey {
	const keys: Partial<Record<ApiErrorKind, MessagelessMessageKey>> =
		messagelessMessageKeys;
	return keys[kind] ?? "feedback.appError.unknown";
}

function describeMediaRefusal({
	refusal,
	wording: { translate, formatInteger },
}: {
	refusal: MediaRefusal;
	wording: Wording;
}): string {
	if (refusal.reason === "photoTooLarge") {
		return translate("common.media.errors.photoTooLarge", {
			megabytes: formatInteger(
				Math.floor(refusal.maxBytes / BYTES_PER_MEGABYTE),
			),
		});
	}
	return translate(mediaReasonMessageKeys[refusal.reason]);
}

function describeAppError({
	appError: { kind, message },
	wording,
}: {
	appError: AppError;
	wording: Wording;
}): string {
	const { translate } = wording;
	if (kind === "Connect") {
		return translate("feedback.appError.connectionFailed");
	}
	if (typeof message === "string") {
		return describeServerMessage({ message, translate });
	}
	if (message !== undefined && "code" in message) {
		return translate("feedback.appError.withCode", {
			code: String(message.code),
			detail: describeServerMessage({
				message: message.message,
				translate,
			}),
		});
	}
	if (kind === "Media" && message !== undefined) {
		const refusal = mediaRefusalSchema.safeParse(message);
		if (refusal.success) {
			return describeMediaRefusal({ refusal: refusal.data, wording });
		}
		if (typeof message.detail === "string") {
			return describeServerMessage({
				message: message.detail,
				translate,
			});
		}
	}
	return translate(messagelessMessageKey(kind));
}

export function asAppError(error: unknown) {
	const { data, success } = appErrorSchema.safeParse(error);
	if (success) {
		const prettyMessage = describeAppError({
			appError: data,
			wording: shownWording,
		});
		return { ...data, prettyMessage };
	}
}

export function diagnosticMessage(error: unknown): string {
	const { data, success } = appErrorSchema.safeParse(error);
	if (success) {
		return describeAppError({ appError: data, wording: diagnosticWording });
	}
	return error instanceof Error ? error.message : String(error);
}

export function errorKindOf(error: unknown): ApiErrorKind | null {
	return error instanceof ApiError
		? error.kind
		: (asAppError(error)?.kind ?? null);
}

export function uploadRefusalMessage({
	error,
	limitLabel,
}: {
	error: unknown;
	limitLabel: string;
}): string | null {
	const kind = errorKindOf(error);
	if (kind === "ContentTooLarge" || httpStatusOf(error) === 413) {
		return t("feedback.appError.overLimit", { limit: limitLabel });
	}
	const refused = mediaRefusalErrorSchema.safeParse(
		error instanceof ApiError ? error.cause : error,
	);
	return refused.success
		? describeMediaRefusal({
				refusal: refused.data.message,
				wording: shownWording,
			})
		: null;
}

function describeServerMessage({
	message,
	translate,
}: {
	message: string;
	translate: Translate;
}): string {
	const summary = summariseNonJson(message);
	if (summary.nonJson !== "html") {
		return capText(message, maxPrettyMessageChars);
	}
	return summary.title === undefined
		? translate("feedback.appError.webPage")
		: translate("feedback.appError.titledWebPage", {
				title: summary.title,
			});
}

export function summarizeServerMessage(message: string): string {
	return describeServerMessage({ message, translate: t });
}
