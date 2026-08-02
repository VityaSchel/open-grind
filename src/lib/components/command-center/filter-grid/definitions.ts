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
} from "$lib/components/filters/filters";
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

function rangeText(
	floor: number,
	ceiling: number,
	[min = floor, max = ceiling]: number[],
	format: (value: number, units: UnitSystem) => string,
): string {
	const units = getPreferencesSnapshot().units;
	return `${min === floor ? "No min" : format(min, units)} - ${
		max === ceiling ? "No max" : format(max, units)
	}`;
}

function booleanFilter(
	label: string,
	keys: string[],
	field: BooleanKey,
): Filter {
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
				apply: boundApply(target, 0, rawMin, rawMax, store),
			},
			{
				keys: [options.maxKey],
				apply: boundApply(target, 1, rawMin, rawMax, store),
			},
			{ keys: [options.label], apply: combinedRangeApply(target, min, max) },
		],
	};
}

function enumFilter(
	label: string,
	keys: string[],
	target: ListKey,
	enabled: BooleanKey,
	enumObject: Record<string, number>,
	labelMap: Record<number, string>,
): Filter {
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
				apply: idListApply(
					target,
					enabled,
					(id) => allowed.has(id),
					"Unknown value",
				),
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
	booleanFilter("online", ["onlineOnly", "online"], "isOnline"),
	booleanFilter("favorites", ["favorites", "favorite", "fav"], "isFavorite"),
	booleanFilter("right now", ["rightNow", "right-now", "rn"], "isRightNow"),
	booleanFilter("fresh", ["fresh"], "isFresh"),
	booleanFilter(
		"not recently chatted",
		["notRecentlyChatted", "haventChattedToday"],
		"haventChattedTodayEnabled",
	),
	{
		label: "photos",
		render: (f) => f.photos.map((tag) => photoLabels[tag]).join(", "),
		params: [
			{ keys: ["photoOnly", "hasPhotos"], apply: photoApply("has-photos") },
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
			rangeText(HEIGHT_CM_MIN, HEIGHT_CM_MAX, f.height, formatHeight),
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
			rangeText(WEIGHT_KG_MIN, WEIGHT_KG_MAX, f.weight, formatWeightKg),
	}),
	enumFilter(
		"position",
		["sexualPositions", "positions", "position"],
		"positions",
		"positionEnabled",
		FilterPosition,
		sexualPositions,
	),
	enumFilter(
		"tribes",
		["tribes", "tribe"],
		"tribes",
		"tribesEnabled",
		FilterTribe,
		tribes,
	),
	enumFilter(
		"body type",
		["bodyTypes", "bodyType", "body"],
		"bodyTypes",
		"bodyTypesEnabled",
		FilterBodyType,
		bodyTypes,
	),
	enumFilter(
		"relationship",
		["relationshipStatuses", "relationshipStatus", "relationship"],
		"relationshipStatuses",
		"relationshipStatusesEnabled",
		FilterRelationshipStatus,
		relationshipStatuses,
	),
	enumFilter(
		"nsfw",
		["nsfwPics", "nsfw"],
		"acceptNSFWPics",
		"acceptNSFWPicsEnabled",
		FilterAcceptNSFWPics,
		acceptNSFWPics,
	),
	enumFilter(
		"looking for",
		["lookingFor", "looking"],
		"lookingFor",
		"lookingForEnabled",
		FilterLookingFor,
		lookingFor,
	),
	enumFilter(
		"meet at",
		["meetAt", "meet"],
		"meetAt",
		"meetAtEnabled",
		FilterMeetAt,
		meetAt,
	),
	enumFilter(
		"health",
		["sexualHealth", "health"],
		"healthPractices",
		"healthPracticesEnabled",
		FilterHealthPractice,
		healthPractices,
	),
	{
		label: "genders",
		render: (f) =>
			f.genders
				.map((id) => (id === -1 ? "Not specified" : String(id)))
				.join(", "),
		params: [
			{
				keys: ["genders", "gender"],
				apply: idListApply(
					"genders",
					"genderEnabled",
					(id) => id === -1 || id >= 0,
					"Invalid gender ID",
				),
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
