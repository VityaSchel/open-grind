import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import {
	type OptionFilterDefinition,
	optionFilters,
} from "$lib/components/filters/option-filters";
import { type PlainMessageKey, t } from "$lib/i18n";
import { formatListParts, formatRange } from "$lib/i18n/format";
import {
	AGE_MAX,
	AGE_MIN,
	ageRangeLabel,
	FilterAcceptNSFWPics,
	FilterBodyType,
	FilterHealthPractice,
	FilterLookingFor,
	FilterMeetAt,
	FilterPosition,
	FilterRelationshipStatus,
	FilterTribe,
	type GridSearchFilters,
	HEIGHT_CM_MAX,
	HEIGHT_CM_MIN,
	isFilterableGenderId,
	rangeBoundTexts,
	WEIGHT_GRAMS_MAX,
	WEIGHT_GRAMS_MIN,
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
	weightGramsToKg,
} from "$lib/model/browse/grid/filters";
import { sexualPositions } from "$lib/model/users/profiles";
import { formatHeight, formatWeightKg } from "$lib/util/units";
import {
	booleanApply,
	boundApply,
	combinedRangeApply,
	err,
	idListApply,
	ok,
	photoApply,
	type RangeTarget,
	splitList,
} from "./apply";
import type { BooleanKey, Filter, FilterId, ListKey, ValuePart } from "./types";

const translated = (text: string): ValuePart => ({ text, verbatim: false });
const verbatim = (text: string): ValuePart => ({ text, verbatim: true });

function listParts(items: readonly ValuePart[]): ValuePart[] {
	const elements = [...items];
	return formatListParts(items.map(({ text }) => text)).map(
		({ type, value }) =>
			type === "element"
				? { text: value, verbatim: elements.shift()?.verbatim ?? false }
				: translated(value),
	);
}

function rangeText(
	bounds: Omit<Parameters<typeof rangeBoundTexts>[0], "units">,
): string {
	const [min, max] = rangeBoundTexts({
		...bounds,
		units: preferencesSnapshot().units,
	});
	return formatRange({ min, max });
}

function booleanFilter({
	id,
	label,
	keys,
	field,
}: {
	id: FilterId;
	label: PlainMessageKey;
	keys: string[];
	field: BooleanKey;
}): Filter {
	return {
		id,
		label,
		render: (filters) => [
			translated(
				filters[field]
					? t("commands.filterGrid.yes")
					: t("commands.filterGrid.no"),
			),
		],
		params: [{ keys, apply: booleanApply(field) }],
	};
}

function rangeFilter(options: {
	label: PlainMessageKey;
	target: RangeTarget;
	min: number;
	max: number;
	minKey: string;
	maxKey: string;
	rawMin?: number;
	rawMax?: number;
	store?: (value: number) => number;
	render: (filters: GridSearchFilters) => string;
}): Filter {
	const { target, min, max, store } = options;
	const rawMin = options.rawMin ?? min;
	const rawMax = options.rawMax ?? max;
	return {
		id: target,
		label: options.label,
		render: (filters) => [translated(options.render(filters))],
		params: [
			{
				keys: [options.minKey],
				apply: boundApply({
					target,
					bound: 0,
					min: rawMin,
					max: rawMax,
					store,
				}),
			},
			{
				keys: [options.maxKey],
				apply: boundApply({
					target,
					bound: 1,
					min: rawMin,
					max: rawMax,
					store,
				}),
			},
			{ keys: [target], apply: combinedRangeApply({ target, min, max }) },
		],
	};
}

function enumFilter({
	id,
	keys,
	target,
	enabled,
	enumObject,
	option: { label, table, isOffered = () => true },
}: {
	id: FilterId;
	keys: string[];
	target: ListKey;
	enabled: BooleanKey;
	enumObject: Record<string, number>;
	option: Pick<OptionFilterDefinition, "label" | "table" | "isOffered">;
}): Filter {
	const allowed = new Set(Object.values(enumObject));
	const labelOf = (id: number) =>
		id === -1 && allowed.has(-1)
			? t("common.filters.notSpecified")
			: table[id];
	return {
		id,
		label,
		render: (filters) =>
			listParts(
				(filters[target] as number[]).map((id) => {
					const label = labelOf(id);
					return label === undefined
						? verbatim(String(id))
						: translated(label);
				}),
			),
		params: [
			{
				keys,
				apply: idListApply({
					target,
					enabled,
					isValid: (id) => allowed.has(id) && isOffered(id),
					invalid: "unknownValue",
				}),
			},
		],
	};
}

const photoLabels = {
	"has-photos": "browse.filters.photos.hasPhotos",
	"has-face-pics": "browse.filters.photos.hasFacePics",
	"has-albums": "browse.filters.photos.hasAlbums",
} as const satisfies Record<
	GridSearchFilters["photos"][number],
	PlainMessageKey
>;

export const filters: Filter[] = [
	booleanFilter({
		id: "online",
		label: "common.filters.online",
		keys: ["onlineOnly", "online"],
		field: "isOnline",
	}),
	booleanFilter({
		id: "favorites",
		label: "browse.filters.favorites",
		keys: ["favorites", "favorite", "fav"],
		field: "isFavorite",
	}),
	booleanFilter({
		id: "rightNow",
		label: "common.filters.rightNow",
		keys: ["rightNow", "right-now", "rn"],
		field: "isRightNow",
	}),
	booleanFilter({
		id: "fresh",
		label: "browse.filters.fresh",
		keys: ["fresh"],
		field: "isFresh",
	}),
	booleanFilter({
		id: "notRecentlyChatted",
		label: "browse.filters.haventChattedToday",
		keys: ["notRecentlyChatted", "haventChattedToday"],
		field: "haventChattedTodayEnabled",
	}),
	{
		id: "photos",
		label: "browse.filters.photos.label",
		render: (f) =>
			listParts(f.photos.map((tag) => translated(t(photoLabels[tag])))),
		params: [
			{
				keys: ["photoOnly", "hasPhotos"],
				apply: photoApply("has-photos"),
			},
			{
				keys: ["faceOnly", "facePics", "face"],
				apply: photoApply("has-face-pics"),
			},
			{
				keys: ["hasAlbum", "hasAlbums", "album", "albums"],
				apply: photoApply("has-albums"),
			},
		],
	},
	rangeFilter({
		label: "browse.filters.age.label",
		target: "age",
		min: AGE_MIN,
		max: AGE_MAX,
		minKey: "ageMin",
		maxKey: "ageMax",
		render: (f) => ageRangeLabel(f.age),
	}),
	rangeFilter({
		label: "browse.filters.height.label",
		target: "height",
		min: HEIGHT_CM_MIN,
		max: HEIGHT_CM_MAX,
		minKey: "heightCmMin",
		maxKey: "heightCmMax",
		render: (f) =>
			rangeText({
				floor: HEIGHT_CM_MIN,
				ceiling: HEIGHT_CM_MAX,
				range: f.height,
				format: formatHeight,
			}),
	}),
	rangeFilter({
		label: "browse.filters.weight.label",
		target: "weight",
		min: WEIGHT_KG_MIN,
		max: WEIGHT_KG_MAX,
		minKey: "weightGramsMin",
		maxKey: "weightGramsMax",
		rawMin: WEIGHT_GRAMS_MIN,
		rawMax: WEIGHT_GRAMS_MAX,
		store: weightGramsToKg,
		render: (f) =>
			rangeText({
				floor: WEIGHT_KG_MIN,
				ceiling: WEIGHT_KG_MAX,
				range: f.weight,
				format: formatWeightKg,
			}),
	}),
	enumFilter({
		id: "position",
		keys: ["sexualPositions", "positions", "position"],
		target: "positions",
		enabled: "positionEnabled",
		enumObject: FilterPosition,
		option: {
			label: "common.filters.position.label",
			table: sexualPositions,
		},
	}),
	enumFilter({
		id: "tribes",
		keys: ["tribes", "tribe"],
		target: "tribes",
		enabled: "tribesEnabled",
		enumObject: FilterTribe,
		option: optionFilters.tribes,
	}),
	enumFilter({
		id: "bodyType",
		keys: ["bodyTypes", "bodyType", "body"],
		target: "bodyTypes",
		enabled: "bodyTypesEnabled",
		enumObject: FilterBodyType,
		option: optionFilters.bodyTypes,
	}),
	enumFilter({
		id: "relationship",
		keys: ["relationshipStatuses", "relationshipStatus", "relationship"],
		target: "relationshipStatuses",
		enabled: "relationshipStatusesEnabled",
		enumObject: FilterRelationshipStatus,
		option: optionFilters.relationshipStatuses,
	}),
	enumFilter({
		id: "nsfw",
		keys: ["nsfwPics", "nsfw"],
		target: "acceptNSFWPics",
		enabled: "acceptNSFWPicsEnabled",
		enumObject: FilterAcceptNSFWPics,
		option: optionFilters.acceptNSFWPics,
	}),
	enumFilter({
		id: "lookingFor",
		keys: ["lookingFor", "looking"],
		target: "lookingFor",
		enabled: "lookingForEnabled",
		enumObject: FilterLookingFor,
		option: optionFilters.lookingFor,
	}),
	enumFilter({
		id: "meetAt",
		keys: ["meetAt", "meet"],
		target: "meetAt",
		enabled: "meetAtEnabled",
		enumObject: FilterMeetAt,
		option: optionFilters.meetAt,
	}),
	enumFilter({
		id: "health",
		keys: ["sexualHealth", "health"],
		target: "healthPractices",
		enabled: "healthPracticesEnabled",
		enumObject: FilterHealthPractice,
		option: optionFilters.healthPractices,
	}),
	{
		id: "genders",
		label: "browse.filters.genders.label",
		render: (f) =>
			listParts(
				f.genders.map((id) =>
					id === -1
						? translated(t("common.filters.notSpecified"))
						: verbatim(String(id)),
				),
			),
		params: [
			{
				keys: ["genders", "gender"],
				apply: idListApply({
					target: "genders",
					enabled: "genderEnabled",
					isValid: (id) =>
						id === -1 || (id >= 0 && isFilterableGenderId(id)),
					invalid: "invalidGenderId",
				}),
			},
		],
	},
	{
		id: "tags",
		label: "browse.filters.tags.label",
		render: (f) => listParts(f.tags.map(verbatim)),
		params: [
			{
				keys: ["tags", "tag"],
				apply: (raw, draft) => {
					const parts = splitList(raw);
					if (parts.length === 0) return err({ kind: "noValues" });
					draft.tagsEnabled = true;
					draft.tags = parts;
					return ok;
				},
			},
		],
	},
];
