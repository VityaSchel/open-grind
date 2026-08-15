import z from "zod";

import { ApiError } from "$lib/api/api-error";

const errorBodySchema = z.object({ type: z.string() });

export function errorUrnFromBody(body: string): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	const result = errorBodySchema.safeParse(parsed);
	if (!result.success) return null;
	return result.data.type.startsWith("urn:gr:err:") ? result.data.type : null;
}

export function errorUrn(error: unknown): string | null {
	if (!(error instanceof ApiError) || error.response === null) return null;
	return errorUrnFromBody(error.response.body);
}
