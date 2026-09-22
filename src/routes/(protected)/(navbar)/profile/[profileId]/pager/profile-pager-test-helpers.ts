import { vi } from "vitest";

import { rendered } from "$lib/grid/grid-test-helpers";
import type { GridProfile, RenderedGridProfile } from "$lib/grid/grid";
import type { Profile } from "$lib/model/users/profiles";
import type { ProfileState } from "../profile-state.svelte";
import {
	type ProfilePagerSource,
	ProfilePagerState,
} from "./profile-pager-state.svelte";

export const OUR_ID = 9999;

export const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

export const range = (from: number, to: number) =>
	Array.from({ length: to - from + 1 }, (_, offset) => from + offset);

export function row(id: number): RenderedGridProfile {
	return { ...rendered({ id }), profilePhotosHashes: [`photo-${id}`] };
}

export function fullProfile({
	profileId,
	displayName = `Profile ${profileId}`,
	age = null,
	mediaHashes = [],
}: {
	profileId: number;
	displayName?: string;
	age?: number | null;
	mediaHashes?: string[];
}): Profile {
	return {
		profileId,
		displayName,
		age,
		onlineUntil: null,
		seen: null,
		distance: null,
		isNew: false,
		isFavorite: false,
		tapType: null,
		tapped: false,
		profileTags: [],
		aboutMe: null,
		genders: [],
		pronouns: [],
		ethnicity: null,
		relationshipStatus: null,
		grindrTribes: [],
		lookingFor: [],
		meetAt: [],
		nsfw: null,
		hivStatus: null,
		lastTestedDate: null,
		sexualHealth: [],
		socialNetworks: {},
		sexualPosition: null,
		height: null,
		weight: null,
		bodyType: null,
		medias: mediaHashes.map((mediaHash) => ({
			mediaHash,
			type: 1,
			state: 1,
			reason: null,
			takenOnGrindr: null,
			createdAt: null,
		})),
	} as unknown as Profile;
}

export function gridSource({
	ids,
	nextPage = null,
}: {
	ids: number[];
	nextPage?: number | null;
}) {
	const source = {
		profiles: ids.map(row) as GridProfile[],
		revealProfileId: null as number | null,
		nextPage,
		loadMore: vi.fn(() => Promise.resolve()),
		indexInProfiles: (profileId: number): number =>
			source.profiles.findIndex(
				({ id }: GridProfile) => id === profileId,
			),
		profileById: (profileId: number): GridProfile | null =>
			source.profiles.find(({ id }: GridProfile) => id === profileId) ??
			null,
	} satisfies ProfilePagerSource;
	return source;
}

const openedPagers: ProfilePagerState[] = [];

export function openPager({
	source,
	profileId,
	origin = "browse",
	historyTraversal = false,
}: {
	source: ProfilePagerSource;
	profileId: number;
	origin?: "browse" | null;
	historyTraversal?: boolean;
}): ProfilePagerState {
	const pager = new ProfilePagerState({
		source,
		profileId,
		ourProfileId: OUR_ID,
		origin,
		historyTraversal,
	});
	openedPagers.push(pager);
	return pager;
}

export function destroyOpenedPagers(): void {
	for (const pager of openedPagers.splice(0)) pager.destroy();
}

export const mountedPositions = (pager: ProfilePagerState) =>
	pager.mounted.map(({ position }) => position);

export function stateOf({
	pager,
	profileId,
}: {
	pager: ProfilePagerState;
	profileId: number;
}): ProfileState | undefined {
	return pager.mounted.find((mounted) => mounted.profileId === profileId)
		?.state;
}
