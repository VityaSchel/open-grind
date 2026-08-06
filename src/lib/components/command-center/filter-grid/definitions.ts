import { getPreferencesSnapshot } from "$lib/app-data/preferences.svelte";
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
	WEIGHT_KG_MAX,
	WEIGHT_KG_MIN,
} from "$lib/model/browse/grid/filters";
import {
	acceptNSFWPics,
	bodyTypes,
	healthPractices,
	lookingFor,
	meetAt,
	relationshipStatuses,
	sexualPositions,
	tribes,
} from "$lib/model/users/profiles";
import { formatHeight, formatWeightKg, type UnitSystem } from "$lib/util/units";
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
import type { BooleanKey, Filter, ListKey, Render } from "./types";

function rangeText({
	floor,
	ceiling,
	range: [min = floor, max = ceiling],
	format,
}: {
	floor: number;
	ceiling: number;
	range: number[];
	format: (value: number, units: UnitSystem) => string;
}): string {
	const units = getPreferencesSnapshot().units;
	return `${min === floor ? "No min" : format(min, units)} - ${
		max === ceiling ? "No max" : format(max, units)
	}`;
}

function booleanFilter({
	label,
	keys,
	field,
}: {
	label: string;
	keys: string[];
	field: BooleanKey;
}): Filter {
	return {
		label,
		render: (filters) => (filters[field] ? "Yes" : "No"),
		params: [{ keys, apply: booleanApply(field) }],
	};
}

function rangeFilter(options: {
	label: string;
	target: RangeTarget;
	min: number;
	max: number;
	minKey: string;
	maxKey: string;
	rawMin?: number;
	rawMax?: number;
	store?: (value: number) => number;
	render: Render;
}): Filter {
	const { target, min, max, store } = options;
	const rawMin = options.rawMin ?? min;
	const rawMax = options.rawMax ?? max;
	return {
		label: options.label,
		render: options.render,
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
			{
				keys: [options.label],
				apply: combinedRangeApply({ target, min, max }),
			},
		],
	};
}

function enumFilter({
	label,
	keys,
	target,
	enabled,
	enumObject,
	labelMap,
}: {
	label: string;
	keys: string[];
	target: ListKey;
	enabled: BooleanKey;
	enumObject: Record<string, number>;
	labelMap: Record<number, string>;
}): Filter {
	const allowed = new Set(Object.values(enumObject));
	const labels = allowed.has(-1)
		? { ...labelMap, [-1]: "Not specified" }
		: labelMap;
	return {
		label,
		render: (filters) =>
			(filters[target] as number[])
				.map((id) => labels[id] ?? String(id))
				.join(", "),
		params: [
			{
				keys,
				apply: idListApply({
					target,
					enabled,
					isValid: (id) => allowed.has(id),
					invalidLabel: "Unknown value",
				}),
			},
		],
	};
}

const photoLabels: Record<GridSearchFilters["photos"][number], string> = {
	"has-photos": "Has photos",
	"has-face-pics": "Face pics",
	"has-albums": "Has albums",
};

export const filters: Filter[] = [
	booleanFilter({
		label: "online",
		keys: ["onlineOnly", "online"],
		field: "isOnline",
	}),
	booleanFilter({
		label: "favorites",
		keys: ["favorites", "favorite", "fav"],
		field: "isFavorite",
	}),
	booleanFilter({
		label: "right now",
		keys: ["rightNow", "right-now", "rn"],
		field: "isRightNow",
	}),
	booleanFilter({ label: "fresh", keys: ["fresh"], field: "isFresh" }),
	booleanFilter({
		label: "not recently chatted",
		keys: ["notRecentlyChatted", "haventChattedToday"],
		field: "haventChattedTodayEnabled",
	}),
	{
		label: "photos",
		render: (f) => f.photos.map((tag) => photoLabels[tag]).join(", "),
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
		label: "age",
		target: "age",
		min: AGE_MIN,
		max: AGE_MAX,
		minKey: "ageMin",
		maxKey: "ageMax",
		render: (f) => ageRangeLabel(f.age),
	}),
	rangeFilter({
		label: "height",
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
		label: "weight",
		target: "weight",
		min: WEIGHT_KG_MIN,
		max: WEIGHT_KG_MAX,
		minKey: "weightGramsMin",
		maxKey: "weightGramsMax",
		rawMin: WEIGHT_KG_MIN * 1000,
		rawMax: WEIGHT_KG_MAX * 1000,
		store: (grams) => grams / 1000,
		render: (f) =>
			rangeText({
				floor: WEIGHT_KG_MIN,
				ceiling: WEIGHT_KG_MAX,
				range: f.weight,
				format: formatWeightKg,
			}),
	}),
	enumFilter({
		label: "position",
		keys: ["sexualPositions", "positions", "position"],
		target: "positions",
		enabled: "positionEnabled",
		enumObject: FilterPosition,
		labelMap: sexualPositions,
	}),
	enumFilter({
		label: "tribes",
		keys: ["tribes", "tribe"],
		target: "tribes",
		enabled: "tribesEnabled",
		enumObject: FilterTribe,
		labelMap: tribes,
	}),
	enumFilter({
		label: "body type",
		keys: ["bodyTypes", "bodyType", "body"],
		target: "bodyTypes",
		enabled: "bodyTypesEnabled",
		enumObject: FilterBodyType,
		labelMap: bodyTypes,
	}),
	enumFilter({
		label: "relationship",
		keys: ["relationshipStatuses", "relationshipStatus", "relationship"],
		target: "relationshipStatuses",
		enabled: "relationshipStatusesEnabled",
		enumObject: FilterRelationshipStatus,
		labelMap: relationshipStatuses,
	}),
	enumFilter({
		label: "nsfw",
		keys: ["nsfwPics", "nsfw"],
		target: "acceptNSFWPics",
		enabled: "acceptNSFWPicsEnabled",
		enumObject: FilterAcceptNSFWPics,
		labelMap: acceptNSFWPics,
	}),
	enumFilter({
		label: "looking for",
		keys: ["lookingFor", "looking"],
		target: "lookingFor",
		enabled: "lookingForEnabled",
		enumObject: FilterLookingFor,
		labelMap: lookingFor,
	}),
	enumFilter({
		label: "meet at",
		keys: ["meetAt", "meet"],
		target: "meetAt",
		enabled: "meetAtEnabled",
		enumObject: FilterMeetAt,
		labelMap: meetAt,
	}),
	enumFilter({
		label: "health",
		keys: ["sexualHealth", "health"],
		target: "healthPractices",
		enabled: "healthPracticesEnabled",
		enumObject: FilterHealthPractice,
		labelMap: healthPractices,
	}),
	{
		label: "genders",
		render: (f) =>
			f.genders
				.map((id) => (id === -1 ? "Not specified" : String(id)))
				.join(", "),
		params: [
			{
				keys: ["genders", "gender"],
				apply: idListApply({
					target: "genders",
					enabled: "genderEnabled",
					isValid: (id) => id === -1 || id >= 0,
					invalidLabel: "Invalid gender ID",
				}),
			},
		],
	},
	{
		label: "tags",
		render: (f) => f.tags.join(", "),
		params: [
			{
				keys: ["tags", "tag"],
				apply: (raw, draft) => {
					const parts = splitList(raw);
					if (parts.length === 0) return err("No values");
					draft.tagsEnabled = true;
					draft.tags = parts;
					return ok;
				},
			},
		],
	},
];
