import { type MessageKey, t } from "$lib/i18n";

export const apiErrorKinds = [
	"Http",
	"Connect",
	"Auth",
	"Media",
	"NotSignedIn",
	"SessionStale",
	"Api",
	"Unauthorized",
	"Banned",
	"RateLimited",
	"RequestBlocked",
	"NetworkBlocked",
	"NotInitialized",
	"SessionCleared",
	"ContentTooLarge",
	"Recaptcha",
	"Push",
] as const;

export type ApiErrorKind = (typeof apiErrorKinds)[number];

export class ApiError extends Error {
	readonly request: { method: string; path: string; body?: unknown };
	readonly response: { status: number; body: string } | null;
	readonly kind: ApiErrorKind | null;

	constructor(options: {
		message: string;
		request: { method: string; path: string; body?: unknown };
		response?: { status: number; body: string } | null;
		kind?: ApiErrorKind | null;
		cause?: unknown;
	}) {
		super(options.message, { cause: options.cause });
		this.name = "ApiError";
		this.request = options.request;
		this.response = options.response ?? null;
		this.kind = options.kind ?? null;
	}

	get retryable(): boolean {
		if (this.kind === "Http" || this.kind === "Connect") return true;
		if (this.kind === "Auth" || this.kind === "Unauthorized") return true;
		if (this.kind === "SessionStale") return true;
		if (this.kind === "RequestBlocked") return true;
		if (this.kind === "NetworkBlocked") return true;
		if (this.response !== null) {
			const { status } = this.response;
			if (status >= 500) return true;
			if (status === 401 || status === 408 || status === 429) return true;
		}
		return false;
	}
}

export function httpStatusOf(error: unknown): number | null {
	return error instanceof ApiError ? (error.response?.status ?? null) : null;
}

export const apiErrorMessageKeys = {
	Connect: "feedback.apiError.connect",
	Http: "feedback.apiError.http",
	RequestBlocked: "feedback.apiError.requestBlocked",
	NetworkBlocked: "feedback.apiError.networkBlocked",
	SessionStale: "feedback.apiError.sessionStale",
} as const satisfies Partial<Record<ApiErrorKind, MessageKey>>;

type ApiErrorMessageKey =
	(typeof apiErrorMessageKeys)[keyof typeof apiErrorMessageKeys];

export function apiErrorMessage(kind: ApiErrorKind): string | undefined {
	const keys: Partial<Record<ApiErrorKind, ApiErrorMessageKey>> =
		apiErrorMessageKeys;
	const key = keys[kind];
	return key === undefined ? undefined : t(key);
}
