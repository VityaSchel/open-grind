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
import { demoCallMethod, demoEnabled } from "$lib/demo";
import { type MessageKey, sourceText, t, type Translate } from "$lib/i18n";
import { geohashSchema } from "$lib/model/geohash";

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
		.or(z.object({ reason: z.string(), detail: z.string().nullish() }))
		.optional(),
});

type AppError = z.infer<typeof appErrorSchema>;

export const banInfoSchema = z.object({
	kind: z.string(),
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

export async function callMethod<T extends keyof typeof methods>(
	method: T,
	...args: undefined extends z.infer<(typeof methods)[T]["request"]>
		? [data?: z.infer<(typeof methods)[T]["request"]>]
		: [data: z.infer<(typeof methods)[T]["request"]>]
): Promise<z.infer<(typeof methods)[T]["response"]>> {
	type Result = z.infer<(typeof methods)[T]["response"]>;
	if (demoEnabled) {
		return methods[method].response.parse(demoCallMethod(method)) as Result;
	}
	try {
		return methods[method].response.parse(
			await invoke(method, args[0]),
		) as Result;
	} catch (error) {
		const kind = blockedKindOf(asAppError(error)?.kind);
		if (kind !== undefined) {
			markRequestBlocked({ kind });
		}
		throw error;
	}
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

function messagelessMessageKey(kind: ApiErrorKind): MessagelessMessageKey {
	const keys: Partial<Record<ApiErrorKind, MessagelessMessageKey>> =
		messagelessMessageKeys;
	return keys[kind] ?? "feedback.appError.unknown";
}

function describeAppError({
	appError: { kind, message },
	translate,
}: {
	appError: AppError;
	translate: Translate;
}): string {
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
	return translate(messagelessMessageKey(kind));
}

export function asAppError(error: unknown) {
	const { data, success } = appErrorSchema.safeParse(error);
	if (success) {
		const prettyMessage = describeAppError({
			appError: data,
			translate: t,
		});
		return { ...data, prettyMessage };
	}
}

export function diagnosticMessage(error: unknown): string {
	const { data, success } = appErrorSchema.safeParse(error);
	if (success) {
		return describeAppError({ appError: data, translate: sourceText });
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
	if (kind !== "Media") return null;
	const detail = asAppError(error)?.message;
	return typeof detail === "string" && detail !== "" ? detail : null;
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
