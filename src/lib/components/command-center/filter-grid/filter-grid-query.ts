import { defaultFilters } from "$lib/components/filters/filters";
import { filters } from "./definitions";
import type {
	Apply,
	Filter,
	ParsedFilter,
	ParsedFilterGridQuery,
} from "./types";

export type { ParsedFilter, ParsedFilterGridQuery } from "./types";

const handlers = new Map<string, { filter: Filter; apply: Apply }>();
for (const filter of filters)
	for (const param of filter.params)
		for (const key of param.keys)
			handlers.set(key, { filter, apply: param.apply });

export function parseFilterGridQuery(query: string): ParsedFilterGridQuery {
	const draft = structuredClone(defaultFilters);
	const raw = query.startsWith("?") ? query.slice(1) : query;

	const parsed: ParsedFilter[] = [];
	const badges = new Map<Filter, ParsedFilter>();

	for (const [key, value] of new URLSearchParams(raw)) {
		const handler = handlers.get(key);
		if (!handler) {
			parsed.push({
				key,
				valueText: value,
				valid: false,
				error: "Unknown filter",
			});
			continue;
		}
		let badge = badges.get(handler.filter);
		if (!badge) {
			badge = { key: handler.filter.label, valueText: "", valid: true };
			badges.set(handler.filter, badge);
			parsed.push(badge);
		}
		const result = handler.apply(value, draft);
		if (!result.ok && badge.valid) {
			badge.valid = false;
			badge.error = result.error;
		}
	}

	for (const [filter, badge] of badges)
		if (badge.valid) badge.valueText = filter.render(draft);

	const validCount = parsed.filter((badge) => badge.valid).length;
	return {
		filters: draft,
		parsed,
		validCount,
		invalidCount: parsed.length - validCount,
	};
}
