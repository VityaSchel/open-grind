import { decode, encode } from "@msgpack/msgpack";
import { invoke } from "@tauri-apps/api/core";
import { goto } from "$app/navigation";
import { toast } from "svelte-sonner";
import z from "zod";

import { ApiError } from "$lib/api/api-error";
import { requestBlockedAlertState } from "$lib/api/request-blocked/request-blocked-state.svelte";
import { fromBase64, toBase64 } from "$lib/base64";
import { demoCallMethod, demoEnabled, demoRoute } from "$lib/demo";

export const methods = {
	login: {
		request: z.object({
			email: z.email(),
			password: z.string().min(1),
		}),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	login_with_google: {
		request: z.undefined(),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	google_sign_in: {
		request: z.object({
			token: z.string().min(1),
		}),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	auth_state: {
		request: z.undefined(),
		response: z.int().nonnegative().nullable(),
	},
	refresh_token: {
		request: z.undefined(),
		response: z.object({
			profileId: z.coerce.number().int().nonnegative(),
		}),
	},
	rotate_api_params: {
		request: z.undefined(),
		response: z.object({
			"user-agent": z.string(),
			"l-device-info": z.string(),
		}),
	},
	logout: {
		request: z.undefined(),
		response: z.undefined(),
	},
	recaptcha_first_party_enabled: {
		request: z.undefined(),
		response: z.boolean(),
	},
} satisfies Record<string, { request: z.ZodType; response: z.ZodType }>;

export async function callMethod<T extends keyof typeof methods>(
	method: T,
	...args: z.infer<(typeof methods)[T]["request"]> extends undefined
		? []
		: [data: z.infer<(typeof methods)[T]["request"]>]
): Promise<z.infer<(typeof methods)[T]["response"]>> {
	if (demoEnabled) {
		return demoCallMethod(method) as z.infer<(typeof methods)[T]["response"]>;
	}
	return await invoke(method, args[0]);
}

export function asAppError(error: unknown) {
	const { data, success } = z
		.object({
			kind: z.enum(["Http", "Auth", "Api", "Unauthorized", "NotInitialized"]),
			message: z
				.string()
				.or(
					z.object({
						code: z.number(),
						message: z.string(),
					}),
				)
				.optional(),
		})
		.safeParse(error);
	if (success) {
		let prettyMessage: string;
		if (typeof data.message === "string") {
			prettyMessage = data.message;
		} else if (data.message) {
			prettyMessage = `Error ${data.message.code}: ${data.message.message}`;
		} else {
			prettyMessage = "An unknown error occurred";
		}
		return { ...data, prettyMessage };
	}
}

type RequestInfo = { method: string; path: string; body: unknown };

function buildRestResponse(
	status: number,
	responseBody: Uint8Array,
	requestInfo: RequestInfo,
) {
	return {
		status,
		bytes() {
			return responseBody;
		},
		text() {
			return new TextDecoder().decode(responseBody);
		},
		assertOk() {
			if (status >= 200 && status < 300) {
				return;
			}
			const text = this.text();
			throw new ApiError({
				message: `API request failed with status ${status}`,
				request: requestInfo,
				response: { status, body: text },
			});
		},
		json() {
			const text = this.text();
			const responseInfo = { status, body: text };
			if (
				status === 403 &&
				text.includes("<title>Attention Required! | Cloudflare</title>") &&
				text.includes("Sorry, you have been blocked")
			) {
				if (!requestBlockedAlertState.disable) {
					requestBlockedAlertState.open = true;
				}
				throw new ApiError({
					message: "Request blocked",
					request: requestInfo,
					response: responseInfo,
				});
			}
			try {
				return JSON.parse(text);
			} catch (error) {
				console.error("Failed to parse JSON response", {
					path: requestInfo.path,
					text,
				});
				throw new ApiError({
					message: "Failed to parse API response",
					request: requestInfo,
					response: responseInfo,
					cause: error,
				});
			}
		},
		jsonParsed<TSchema extends z.ZodType>(schema: TSchema) {
			const data = this.json();
			const bodyText = this.text();
			try {
				return parseApiResponse({
					schema,
					data,
					path: requestInfo.path,
					method: requestInfo.method,
				});
			} catch (error) {
				if (error instanceof ApiError) throw error;
				throw new ApiError({
					message:
						error instanceof Error
							? error.message
							: "API response validation failed",
					request: requestInfo,
					response: { status, body: bodyText },
					cause: error,
				});
			}
		},
		debugJsonParsed<TSchema extends z.ZodType>(schema: TSchema) {
			console.log(this.json());
			return this.jsonParsed(schema);
		},
	};
}

export async function fetchRest(
	path: string,
	options: {
		method?: string;
		body?: unknown;
		abortController?: AbortController;
	} = { method: "GET" },
) {
	const method = options.method ?? "GET";
	const requestInfo = {
		method,
		path,
		body: options.body,
	};
	if (demoEnabled) {
		const { status, body } = demoRoute(path, method, options.body);
		const responseBody = new TextEncoder().encode(JSON.stringify(body ?? null));
		return buildRestResponse(status, responseBody, requestInfo);
	}
	try {
		const payload = encode({
			method: options.method || "GET",
			path,
			body: options.body === undefined ? null : encode(options.body),
		});
		const packed = await invoke("request", {
			// https://github.com/tauri-apps/tauri/issues/10573
			payload: toBase64(payload),
		}).then((res) => {
			if (typeof res === "string") {
				// https://github.com/tauri-apps/tauri/issues/10573
				return fromBase64(res);
			} else {
				throw new Error("Invalid response from backend");
			}
		});
		if (options.abortController?.signal.aborted) {
			throw new Error("Request aborted");
		}
		const decoded = decode(packed);
		const { status, body: responseBody } = z
			.object({ status: z.number(), body: z.instanceof(Uint8Array) })
			.parse(decoded);
		return buildRestResponse(status, responseBody, requestInfo);
	} catch (error) {
		if (error instanceof ApiError) throw error;
		const appError = asAppError(error);
		if (appError) {
			if (appError.kind === "Auth" && appError.message === "Not logged in") {
				goto("/auth/sign-in").catch((error) => console.error(error));
			}
		}
		throw new ApiError({
			message:
				appError?.prettyMessage ??
				(error instanceof Error ? error.message : String(error)),
			request: requestInfo,
			response: null,
			kind: appError?.kind ?? null,
			cause: error,
		});
	}
}

export function parseApiResponse<TSchema extends z.ZodType>(options: {
	schema: TSchema;
	data: unknown;
	path: string;
	method?: string;
}): z.infer<TSchema> {
	const parsed = options.schema.safeParse(options.data);
	if (parsed.success) {
		return parsed.data;
	}

	console.error("API response schema validation failed", {
		path: options.path,
		method: options.method ?? "GET",
		schema: options.schema.meta()?.title,
		issues: parsed.error.issues,
		response: options.data,
	});

	throw parsed.error;
}

export { ApiError };
