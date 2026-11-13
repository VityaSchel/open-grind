import { isAssignmentOn } from "#lib/api/analytics/assignments.ts";
import { fetchRest } from "#lib/api/transport.ts";
import {
	type RightNowFeedQuery,
	rightNowFeedQuerySchema,
	type RightNowFeedResponse,
	rightNowFeedResponseSchema,
} from "#lib/model/right-now/feed.ts";
import { markOnlineRefreshed } from "#lib/presence/online-clock.ts";
import { urlSearchParamsCodec } from "#lib/util/url-search-params.ts";

export type RightNowFeedVersion = "v4" | "v5" | "v6";

export async function rightNowFeedVersion(): Promise<RightNowFeedVersion> {
	const [explicitImages, discreetPosting] = await Promise.all([
		isAssignmentOn({ key: "right-now-explicit-images" }),
		isAssignmentOn({ key: "right-now-discreet" }),
	]);
	if (explicitImages) return "v6";
	return discreetPosting ? "v5" : "v4";
}

export async function getRightNowFeed({
	version,
	query,
}: {
	version: RightNowFeedVersion;
	query: RightNowFeedQuery;
}): Promise<RightNowFeedResponse> {
	const params = urlSearchParamsCodec(rightNowFeedQuerySchema).encode(query);
	const feed = await fetchRest(
		`/${version}/rightnow/feed?${params.toString()}`,
	).then((res) => res.jsonParsed(rightNowFeedResponseSchema));
	markOnlineRefreshed();
	return feed;
}
