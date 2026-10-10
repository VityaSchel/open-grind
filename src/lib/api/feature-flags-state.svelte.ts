import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { callMethod } from "$lib/api/methods";
import { isTribeOffered } from "$lib/model/users/profiles";
import { isTagKeyOffered } from "$lib/model/users/tags";

const GENDER_FILTER_FLAG = "gender-filter";

export const featureFlagsState = $state<{ keys: string[] }>({ keys: [] });

registerAccountCache({
	reset: () => {
		featureFlagsState.keys = [];
	},
});

export const genderFilterFlag = () =>
	featureFlagsState.keys.includes(GENDER_FILTER_FLAG);

export const isTribeOfferedNow = (id: number) =>
	isTribeOffered({ id, genderFilterFlag: genderFilterFlag() });

export const isTagKeyOfferedNow = (key: string) =>
	isTagKeyOffered({ key, genderFilterFlag: genderFilterFlag() });

export async function refreshFeatureFlags(): Promise<void> {
	const epoch = accountEpoch();
	try {
		const keys = await callMethod("session_feature_flags");
		if (isAccountEpochCurrent(epoch)) featureFlagsState.keys = keys;
	} catch (error) {
		console.error(error);
	}
}
