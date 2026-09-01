import z from "zod";

import { ApiError } from "$lib/api/api-error";

const errorBodySchema = z.object({ type: z.string() });

const tieredFeatureBodySchema = z.object({
	type: z.literal("urn:gr:err:tiered_feature"),
	featureValue: z.string(),
});

function parseErrorBody(body: string): unknown {
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

export function errorUrnFromBody(body: string): string | null {
	const result = errorBodySchema.safeParse(parseErrorBody(body));
	if (!result.success) return null;
	return result.data.type.startsWith("urn:gr:err:") ? result.data.type : null;
}

export function errorUrn(error: unknown): string | null {
	if (!(error instanceof ApiError) || error.response === null) return null;
	return errorUrnFromBody(error.response.body);
}

export function tieredFeatureFromBody(body: string): string | null {
	const result = tieredFeatureBodySchema.safeParse(parseErrorBody(body));
	return result.success ? result.data.featureValue : null;
}

export function tieredFeature(error: unknown): string | null {
	if (!(error instanceof ApiError) || error.response === null) return null;
	return tieredFeatureFromBody(error.response.body);
}
