import z from "zod";

import { knownValueOrNull } from "#lib/model/tolerance.ts";

export const rightNowPostEntitlementsResponseSchema = z.object({
	type: knownValueOrNull({
		value: z.enum(["UNLIMITED", "GRANTED"]),
		label: "right now post entitlement type",
	}),
	count: z.int().optional(),
});
export type RightNowPostEntitlementsResponse = z.infer<
	typeof rightNowPostEntitlementsResponseSchema
>;

export type FreeRightNowPosts = number | "unlimited" | null;

export function freeRightNowPostsLeft(
	entitlements: RightNowPostEntitlementsResponse,
): FreeRightNowPosts {
	if (entitlements.type === "UNLIMITED") return "unlimited";
	if (entitlements.type !== "GRANTED") return null;
	return Math.max(0, entitlements.count ?? 0);
}
