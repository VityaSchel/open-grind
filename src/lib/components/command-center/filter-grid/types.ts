import type { GridSearchFilters } from "$lib/components/filters/filters";

export type ParsedFilter = {
	key: string;
	valueText: string;
	valid: boolean;
	error?: string;
};

export type ParsedFilterGridQuery = {
	filters: GridSearchFilters;
	parsed: ParsedFilter[];
	validCount: number;
	invalidCount: number;
};

export type ApplyResult = { ok: true } | { ok: false; error: string };
export type Apply = (raw: string, draft: GridSearchFilters) => ApplyResult;
export type Render = (filters: GridSearchFilters) => string;

export type Param = { keys: string[]; apply: Apply };
export type Filter = { label: string; render: Render; params: Param[] };

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
