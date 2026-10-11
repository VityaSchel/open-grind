import type { PlainMessageKey } from "$lib/i18n";
import type { GridSearchFilters } from "$lib/model/browse/grid/filters";

export type FilterError =
	| { kind: "unknownFilter" }
	| { kind: "expectedBoolean" }
	| { kind: "notANumber" }
	| { kind: "outOfRange"; min: number; max: number }
	| { kind: "rangeSyntax" }
	| { kind: "noValues" }
	| { kind: "unknownValue"; value: string }
	| { kind: "invalidGenderId"; value: string };

export type InvalidValueKind = Extract<FilterError, { value: string }>["kind"];

export type ParsedFilter = {
	key: string;
	label?: PlainMessageKey;
	valueText: string;
	valid: boolean;
	error?: FilterError;
};

export type ParsedFilterGridQuery = {
	filters: GridSearchFilters;
	parsed: ParsedFilter[];
	validCount: number;
	invalidCount: number;
};

export type ApplyResult = { ok: true } | { ok: false; error: FilterError };
export type Apply = (raw: string, draft: GridSearchFilters) => ApplyResult;
export type Render = (filters: GridSearchFilters) => string;

export type Param = { keys: string[]; apply: Apply };
export type FilterId =
	| "online"
	| "favorites"
	| "rightNow"
	| "fresh"
	| "notRecentlyChatted"
	| "photos"
	| "age"
	| "height"
	| "weight"
	| "position"
	| "tribes"
	| "bodyType"
	| "relationship"
	| "nsfw"
	| "lookingFor"
	| "meetAt"
	| "health"
	| "genders"
	| "tags";

export type Filter = {
	id: FilterId;
	label: PlainMessageKey;
	render: Render;
	params: Param[];
};

export type BooleanKey = {
	[K in keyof GridSearchFilters]: GridSearchFilters[K] extends boolean
		? K
		: never;
}[keyof GridSearchFilters];
export type ListKey = {
	[K in keyof GridSearchFilters]: GridSearchFilters[K] extends readonly unknown[]
		? K
		: never;
}[keyof GridSearchFilters];
