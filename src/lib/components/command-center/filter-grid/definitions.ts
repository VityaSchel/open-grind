import { getUnitsSnapshot } from "$lib/app-data/preferences.svelte";
import {
	FilterAcceptNSFWPics,
	FilterBodyType,
	FilterHealthPractice,
	FilterLookingFor,
	FilterMeetAt,
	FilterPosition,
	FilterRelationshipStatus,
	FilterTribe,
	type GridSearchFilters,
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

function ageText([min, max]: number[]): string {
	return max === 102 ? `${min} years & over` : `${min} - ${max}`;
}

function rangeText(
	[min, max]: number[],
	floor: number,
	ceiling: number,
	format: (value: number, units: UnitSystem) => string,
): string {
	const units = getUnitsSnapshot();
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
		min: 18,
		max: 102,
		minKey: "ageMin",
		maxKey: "ageMax",
		render: (f) => ageText(f.age),
	}),
	rangeFilter({
		label: "height",
		target: "height",
		min: 120,
		max: 242,
		minKey: "heightCmMin",
		maxKey: "heightCmMax",
		render: (f) => rangeText(f.height, 120, 242, formatHeight),
	}),
	rangeFilter({
		label: "weight",
		target: "weight",
		min: 40,
		max: 273,
		minKey: "weightGramsMin",
		maxKey: "weightGramsMax",
		rawMin: 40000,
		rawMax: 273000,
		store: (grams) => grams / 1000,
		render: (f) => rangeText(f.weight, 40, 273, formatWeightKg),
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
