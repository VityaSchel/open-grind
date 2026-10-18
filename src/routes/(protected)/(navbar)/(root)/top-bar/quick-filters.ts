import { type CascadeFilterKey, sentFilterKeys } from "$lib/grid/grid-query";
import type { GridSearchFilters } from "$lib/model/browse/grid/filters";

const QUICK_FILTER_KEYS = new Set<CascadeFilterKey>([
	"onlineOnly",
	"rightNow",
	"fresh",
	"ageMin",
	"ageMax",
	"sexualPositions",
]);

export const sentFilterKeysWithoutQuickFilter = ({
	filters,
	genderFilterFlag,
}: {
	filters: GridSearchFilters;
	genderFilterFlag: boolean;
}) =>
	sentFilterKeys({ filters, genderFilterFlag }).filter(
		(key) => !QUICK_FILTER_KEYS.has(key),
	);
