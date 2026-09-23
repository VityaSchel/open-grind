import { SvelteSet } from "svelte/reactivity";

import {
	getAlbumShares,
	shareAlbum,
	unshareAlbum,
} from "$lib/api/messaging/albums";
import { albumShares } from "$lib/chat/album-shares.svelte";

export class AlbumSharedWith {
	#albumId: number;
	#sharedCount: number;
	#shared = new SvelteSet<number>();
	#loaded = $state(false);
	#generation = 0;

	constructor({
		albumId,
		sharedCount,
	}: {
		albumId: number;
		sharedCount: number;
	}) {
		this.#albumId = albumId;
		this.#sharedCount = sharedCount;
	}

	get count(): number {
		return this.#loaded ? this.#shared.size : this.#sharedCount;
	}

	async load(): Promise<number[]> {
		const generation = ++this.#generation;
		const { profileIds } = await getAlbumShares(this.#albumId);
		if (generation !== this.#generation) return profileIds;
		this.#shared.clear();
		for (const profileId of profileIds) this.#shared.add(profileId);
		this.#loaded = true;
		albumShares.record({ albumId: this.#albumId, profileIds });
		return profileIds;
	}

	#apply({
		profileId,
		shared,
	}: {
		profileId: number;
		shared: boolean;
	}): void {
		if (shared) this.#shared.add(profileId);
		else this.#shared.delete(profileId);
		albumShares.set({ albumId: this.#albumId, profileId, shared });
	}

	async setShared({
		profileId,
		shared,
	}: {
		profileId: number;
		shared: boolean;
	}): Promise<void> {
		const albumId = this.#albumId;
		const wasShared = this.#shared.has(profileId);
		this.#generation++;
		this.#apply({ profileId, shared });
		try {
			if (shared) await shareAlbum({ albumId, profileIds: [profileId] });
			else await unshareAlbum({ albumId, profileIds: [profileId] });
		} catch (error) {
			this.#apply({ profileId, shared: wasShared });
			throw error;
		}
	}
}
