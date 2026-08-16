import type { Snippet } from "svelte";

import type { getProfiles } from "$lib/api/users/profiles";

type ResolvedProfile = Awaited<ReturnType<typeof getProfiles>>[number];

export type ProfileListEntry = {
	profileId: number;
	profile: ResolvedProfile | null;
};

export type ProfileListScroll = { scrollY: number };

export type ProfileListToggle = {
	icon: Snippet<[boolean]>;
	label: string;
	errorLabel: { turningOn: string; turningOff: string };
	setOn: (args: { profileId: number; on: boolean }) => Promise<void>;
};
