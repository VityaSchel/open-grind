import {
	acceptNSFWPics,
	bodyTypes,
	ethnicities,
	healthPractices,
	hivStatuses,
	lookingFor as lookingForLabels,
	meetAt as meetAtLabels,
	relationshipStatuses,
	sexualPositions,
	tribes,
	vaccines as vaccineLabels,
} from "$lib/model/users/profiles";
import { optionsFromMap } from "$lib/util/options";
import type { Gender } from "$lib/model/users/genders";
import type { Pronoun } from "$lib/model/users/pronouns";
import type { ProfileTagsResponse } from "$lib/model/users/tags";

export const fieldLimits = { displayName: 25, aboutMe: 255 } as const;

export const maxProfileTags = 10;
export const maxProfileGenders = 3;
export const maxProfilePronouns = 3;

export const primaryGenderOrder = [1, 4, 5, 2, 6, 7, 3];

export const heightCmRange = { min: 120, max: 250 } as const;
export const weightKgRange = { min: 30, max: 250 } as const;
export const ageRange = { min: 18, max: 99 } as const;

export const ethnicityOptions = optionsFromMap(ethnicities);
export const relationshipOptions = optionsFromMap(relationshipStatuses);
export const bodyTypeOptions = optionsFromMap(bodyTypes);
export const hivOptions = optionsFromMap(hivStatuses);
export const positionOptions = optionsFromMap(sexualPositions);
export const nsfwOptions = optionsFromMap(acceptNSFWPics);
export const lookingForOptions = optionsFromMap(lookingForLabels);
export const tribeOptions = optionsFromMap(tribes);
export const meetAtOptions = optionsFromMap(meetAtLabels);
export const vaccineOptions = optionsFromMap(vaccineLabels);
export const healthOptions = optionsFromMap(healthPractices);

export function buildGenderOptions(genders: Gender[]) {
	const byId = new Map(genders.map((gender) => [gender.genderId, gender]));
	const primaryRank = (id: number) => {
		const index = primaryGenderOrder.indexOf(id);
		return index === -1 ? Infinity : index;
	};
	return {
		options: genders
			.filter((gender) => (gender.displayGroup ?? 0) > 0)
			.sort(
				(a, b) =>
					primaryRank(a.genderId) - primaryRank(b.genderId) ||
					(a.sortProfile ?? Infinity) - (b.sortProfile ?? Infinity) ||
					a.genderId - b.genderId,
			)
			.map((gender) => ({
				value: gender.genderId,
				label: gender.gender,
			})),
		resolveLabel: (id: number) => byId.get(id)?.gender,
		exclusions: (id: number) =>
			byId.get(id)?.excludeOnProfileSelection ?? [],
	};
}

export function buildPronounOptions(pronouns: Pronoun[]) {
	const byId = new Map(
		pronouns.map((pronoun) => [pronoun.pronounId, pronoun]),
	);
	return {
		options: pronouns.map((pronoun) => ({
			value: pronoun.pronounId,
			label: pronoun.pronoun,
		})),
		resolveLabel: (id: number) => byId.get(id)?.pronoun,
	};
}

export function buildTagOptions(tags: ProfileTagsResponse) {
	const textByKey = new Map<string, string>();
	for (const language of tags) {
		for (const category of language.categoryCollection) {
			for (const tag of category.tags) {
				if (!textByKey.has(tag.key)) textByKey.set(tag.key, tag.text);
			}
		}
	}
	return {
		options: [...textByKey]
			.map(([key, text]) => ({ value: key, label: text }))
			.sort((a, b) => a.label.localeCompare(b.label)),
		resolveLabel: (key: string) => textByKey.get(key),
	};
}
