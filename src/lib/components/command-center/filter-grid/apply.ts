import type { GridSearchFilters } from "$lib/model/browse/grid/filters";
import type {
	Apply,
	ApplyResult,
	BooleanKey,
	FilterError,
	InvalidValueKind,
	ListKey,
} from "./types";

export const ok: ApplyResult = { ok: true };
export const err = (error: FilterError): ApplyResult => ({ ok: false, error });

export const booleanTokens = {
	trueValue: "true",
	falseValue: "false",
} as const;

export function parseBoolean(raw: string): boolean | null {
	const value = raw.trim().toLowerCase();
	if (value === booleanTokens.trueValue || value === "1") return true;
	if (value === booleanTokens.falseValue || value === "0") return false;
	return null;
}

export function splitList(raw: string): string[] {
	return raw
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
}

function parseBounded({
	raw,
	min,
	max,
}: {
	raw: string;
	min: number;
	max: number;
}): { value: number } | { error: FilterError } {
	const value = Number(raw.trim());
	if (!Number.isFinite(value)) return { error: { kind: "notANumber" } };
	if (value < min || value > max)
		return { error: { kind: "outOfRange", min, max } };
	return { value };
}

const rangeEnabled = {
	age: "ageEnabled",
	height: "heightEnabled",
	weight: "weightEnabled",
} as const;
export type RangeTarget = keyof typeof rangeEnabled;

function setBound({
	draft,
	target,
	bound,
	value,
}: {
	draft: GridSearchFilters;
	target: RangeTarget;
	bound: 0 | 1;
	value: number;
}): void {
	const next = [...draft[target]];
	next[bound] = value;
	draft[target] = next;
	draft[rangeEnabled[target]] = true;
}

export function booleanApply(field: BooleanKey): Apply {
	return (raw, draft) => {
		const value = parseBoolean(raw);
		if (value === null) return err({ kind: "expectedBoolean" });
		draft[field] = value;
		return ok;
	};
}

export function photoApply(tag: GridSearchFilters["photos"][number]): Apply {
	return (raw, draft) => {
		const value = parseBoolean(raw);
		if (value === null) return err({ kind: "expectedBoolean" });
		if (value) {
			draft.photosEnabled = true;
			if (!draft.photos.includes(tag))
				draft.photos = [...draft.photos, tag];
		}
		return ok;
	};
}

export function boundApply({
	target,
	bound,
	min,
	max,
	store,
}: {
	target: RangeTarget;
	bound: 0 | 1;
	min: number;
	max: number;
	store?: (value: number) => number;
}): Apply {
	return (raw, draft) => {
		const result = parseBounded({ raw, min, max });
		if ("error" in result) return err(result.error);
		setBound({
			draft,
			target,
			bound,
			value: store ? store(result.value) : result.value,
		});
		return ok;
	};
}

export function combinedRangeApply({
	target,
	min,
	max,
}: {
	target: RangeTarget;
	min: number;
	max: number;
}): Apply {
	return (raw, draft) => {
		const parts = raw.split("-").map((part) => part.trim());
		if (parts.length !== 2) return err({ kind: "rangeSyntax" });
		const [minRaw = "", maxRaw = ""] = parts;
		if (minRaw === "" && maxRaw === "") return err({ kind: "noValues" });
		for (const [bound, raw] of [
			[0, minRaw],
			[1, maxRaw],
		] as const) {
			if (raw === "") continue;
			const result = parseBounded({ raw, min, max });
			if ("error" in result) return err(result.error);
			setBound({ draft, target, bound, value: result.value });
		}
		return ok;
	};
}

export function idListApply({
	target,
	enabled,
	isValid,
	invalid,
}: {
	target: ListKey;
	enabled: BooleanKey;
	isValid: (id: number) => boolean;
	invalid: InvalidValueKind;
}): Apply {
	return (raw, draft) => {
		const parts = splitList(raw);
		if (parts.length === 0) return err({ kind: "noValues" });
		const ids: number[] = [];
		for (const part of parts) {
			const id = Number(part);
			if (!Number.isInteger(id) || !isValid(id))
				return err({ kind: invalid, value: part });
			ids.push(id);
		}
		draft[enabled] = true;
		(draft[target] as number[]) = ids;
		return ok;
	};
}
