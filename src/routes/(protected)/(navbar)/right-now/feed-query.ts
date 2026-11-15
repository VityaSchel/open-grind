import { sendable, sendableRange } from "#lib/grid/grid-query.ts";
import { AGE_MAX, AGE_MIN } from "#lib/model/browse/grid/filters.ts";
import type { RightNowFeedQuery } from "#lib/model/right-now/feed.ts";
import type { RightNowFeedFilters } from "#lib/model/right-now/filters.ts";

export function rightNowFeedQuery(
	filters: RightNowFeedFilters,
): RightNowFeedQuery {
	const [ageMin, ageMax] =
		sendableRange({
			enabled: filters.ageEnabled,
			range: filters.age,
			min: AGE_MIN,
			max: AGE_MAX,
		}) ?? [];
	return {
		sort: filters.sort,
		hosting: filters.hostingEnabled ? filters.hosting : undefined,
		ageMin,
		ageMax,
		sexualPositions: sendable({
			enabled: filters.positionEnabled,
			values: filters.positions,
		}),
	};
}
