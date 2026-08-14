import {
	acceptNSFWPics,
	bodyTypes,
	healthPractices,
	lookingFor,
	meetAt,
	relationshipStatuses,
	tribes,
} from "$lib/model/users/profiles";

export type OptionFilterDefinition = {
	id: string;
	label: string;
	table: Record<number, string>;
};

export const optionFilters = {
	tribes: { id: "tribes", label: "Tribes", table: tribes },
	bodyTypes: { id: "body-type", label: "Body Type", table: bodyTypes },
	relationshipStatuses: {
		id: "relationship-status",
		label: "Relationship Status",
		table: relationshipStatuses,
	},
	acceptNSFWPics: {
		id: "accept-nsfw-pics",
		label: "Accept NSFW Pics",
		table: acceptNSFWPics,
	},
	lookingFor: { id: "looking-for", label: "Looking for", table: lookingFor },
	meetAt: { id: "meet-at", label: "Meet at", table: meetAt },
	healthPractices: {
		id: "health-practices",
		label: "Health Practices",
		table: healthPractices,
	},
} as const satisfies Record<string, OptionFilterDefinition>;
