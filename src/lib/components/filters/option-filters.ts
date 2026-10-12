import { isTribeOfferedNow } from "$lib/api/feature-flags-state.svelte";
import {
	acceptNSFWPics,
	bodyTypes,
	healthPractices,
	lookingFor,
	meetAt,
	relationshipStatuses,
	tribes,
} from "$lib/model/users/profiles";
import type { PlainMessageKey } from "$lib/i18n";

export type OptionFilterDefinition = {
	id: string;
	label: PlainMessageKey;
	table: Record<number, string>;
	isOffered?: (id: number) => boolean;
};

export const optionFilters = {
	tribes: {
		id: "tribes",
		label: "common.filters.options.tribes",
		table: tribes,
		isOffered: isTribeOfferedNow,
	},
	bodyTypes: {
		id: "body-type",
		label: "common.filters.options.bodyType",
		table: bodyTypes,
	},
	relationshipStatuses: {
		id: "relationship-status",
		label: "common.filters.options.relationshipStatus",
		table: relationshipStatuses,
	},
	acceptNSFWPics: {
		id: "accept-nsfw-pics",
		label: "common.filters.options.acceptNsfwPics",
		table: acceptNSFWPics,
	},
	lookingFor: {
		id: "looking-for",
		label: "common.filters.options.lookingFor",
		table: lookingFor,
	},
	meetAt: {
		id: "meet-at",
		label: "common.filters.options.meetAt",
		table: meetAt,
	},
	healthPractices: {
		id: "health-practices",
		label: "common.profileFields.healthPractices",
		table: healthPractices,
	},
} as const satisfies Record<string, OptionFilterDefinition>;
