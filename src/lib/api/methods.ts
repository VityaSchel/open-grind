import { invoke } from "@tauri-apps/api/core";
import z from "zod";

import { type ApiErrorKind, apiErrorKinds } from "$lib/api/api-error";
import { capText } from "$lib/api/redact/text";
import { summariseNonJson } from "$lib/api/redact/value";
import {
	requestBlockedAlertState,
	type RequestBlockKind,
} from "$lib/api/request-blocked-state.svelte";
import { demoCallMethod, demoEnabled } from "$lib/demo";

const maxPrettyMessageChars = 200;

const unknownErrorMessage = "An unknown error occurred";

const messagelessMessages: Partial<Record<ApiErrorKind, string>> = {
	RequestBlocked: "Grindr is blocking your requests",
	NetworkBlocked: "Something blocked the request before it reached Grindr",
	RateLimited: "Grindr is rate limiting us",
	NotLoggedIn: "You're signed out",
};

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

const loginResultSchema = z.object({
	profileId: z.coerce.number().int().nonnegative(),
	restriction: restrictionSchema.nullish(),
});

export const methods = {
	login: {
		request: z.object({ email: z.email(), password: z.string().min(1) }),
		response: loginResultSchema,
	},
	login_with_google: { request: z.undefined(), response: loginResultSchema },
	google_sign_in: {
		request: z.object({ token: z.string().min(1) }),
		response: loginResultSchema,
	},
	auth_state: {
		request: z.undefined(),
		response: z.int().nonnegative().nullable(),
	},
	account_restriction: {
		request: z.undefined(),
		response: restrictionSchema.nullish(),
	},
	refresh_token: { request: z.undefined(), response: loginResultSchema },
	rotate_api_params: {
		request: z.undefined(),
		response: z.object({
			"user-agent": z.string(),
			"l-device-info": z.string(),
		}),
	},
	logout: { request: z.undefined(), response: z.null() },
	recaptcha_first_party_enabled: {
		request: z.undefined(),
		response: z.boolean(),
	},
	session_health: {
		request: z.undefined(),
		response: z.object({
			signedIn: z.boolean(),
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
	...args: z.infer<(typeof methods)[T]["request"]> extends undefined
		? []
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

export function asAppError(error: unknown) {
	const { data, success } = z
		.object({
			kind: z.enum(apiErrorKinds),
			message: z
				.string()
				.or(z.object({ code: z.number(), message: z.string() }))
				.optional(),
		})
		.safeParse(error);
	if (success) {
		let prettyMessage: string;
		if (typeof data.message === "string") {
			prettyMessage = summarizeServerMessage(data.message);
		} else if (data.message) {
			const { code, message } = data.message;
			prettyMessage = `Error ${code}: ${summarizeServerMessage(message)}`;
		} else {
			prettyMessage =
				messagelessMessages[data.kind] ?? unknownErrorMessage;
		}
		return { ...data, prettyMessage };
	}
}

export function summarizeServerMessage(message: string): string {
	const summary = summariseNonJson(message);
	if (summary.nonJson !== "html") {
		return capText(message, maxPrettyMessageChars);
	}
	return summary.title === undefined
		? "The server returned a web page instead of data"
		: `The server returned a web page: "${summary.title}"`;
}
