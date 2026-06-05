export type ApiErrorKind =
	| "Http"
	| "Auth"
	| "Api"
	| "Unauthorized"
	| "NotInitialized";

export class ApiError extends Error {
	readonly request: {
		method: string;
		path: string;
		body?: unknown;
	};
	readonly response: {
		status: number;
		body: string;
	} | null;
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
		if (this.response !== null && this.response.status >= 500) return true;
		return false;
	}

	copyableText(): string {
		return JSON.stringify(
			{
				error: this.message,
				kind: this.kind,
				request: this.request,
				response: this.response,
			},
			null,
			2,
		);
	}
}
