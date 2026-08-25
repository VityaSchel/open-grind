import type { Snippet } from "svelte";

import type { getProfiles } from "$lib/api/users/profiles";

export type ProfileListProfile = Awaited<
	ReturnType<typeof getProfiles>
>[number];

export type ProfileListToggle = {
	icon: Snippet<[boolean]>;
	label: string;
	errorLabel: { turningOn: string; turningOff: string };
	setOn: (args: { profileId: number; on: boolean }) => Promise<void>;
};

export type ProfileListOptions = Pick<
	ProfileListToggle,
	"setOn" | "errorLabel"
> & { loadIds: () => Promise<number[]>; eager: boolean };
