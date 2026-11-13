import { fetchRest } from "#lib/api/transport.ts";
import { rightNowPostEntitlementsResponseSchema } from "#lib/model/browse/entitlements.ts";

export async function getRightNowPostEntitlements() {
	return await fetchRest("/v1/rightnow/entitlements/posts").then((res) =>
		res.jsonParsed(rightNowPostEntitlementsResponseSchema),
	);
}
