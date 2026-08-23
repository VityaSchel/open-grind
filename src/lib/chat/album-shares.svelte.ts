import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";

export class AlbumShareRegistry {
	#sharedWith = new SvelteMap<number, SvelteSet<number>>();

	isResolved(albumId: number): boolean {
		return this.#sharedWith.has(albumId);
	}

	isSharedWith({
		albumId,
		profileId,
	}: {
		albumId: number;
		profileId: number;
	}): boolean | undefined {
		return this.#sharedWith.get(albumId)?.has(profileId);
	}

	record({
		albumId,
		profileIds,
	}: {
		albumId: number;
		profileIds: number[];
	}): void {
		this.#sharedWith.set(albumId, new SvelteSet(profileIds));
	}

	set({
		albumId,
		profileId,
		shared,
	}: {
		albumId: number;
		profileId: number;
		shared: boolean;
	}): void {
		const profiles =
			this.#sharedWith.get(albumId) ?? new SvelteSet<number>();
		if (shared) profiles.add(profileId);
		else profiles.delete(profileId);
		this.#sharedWith.set(albumId, profiles);
	}

	clear(): void {
		this.#sharedWith.clear();
	}
}

export const albumShares = new AlbumShareRegistry();

registerAccountCache({ reset: () => albumShares.clear() });
