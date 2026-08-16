export const apiErrorKinds = [
	"Http",
	"Auth",
	"Media",
	"NotLoggedIn",
	"Api",
	"Unauthorized",
	"Banned",
	"RateLimited",
	"RequestBlocked",
	"NetworkBlocked",
	"NotInitialized",
	"SessionCleared",
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
		if (this.kind === "Http") return true;
		if (this.kind === "Auth" || this.kind === "Unauthorized") return true;
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
