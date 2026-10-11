import { SvelteSet } from "svelte/reactivity";

import {
	getAlbumShares,
	shareAlbum,
	unshareAlbum,
} from "$lib/api/messaging/albums";
import { albumShares } from "$lib/chat/album-shares.svelte";
import { Generation } from "$lib/util/generation";

export class AlbumShareActions {
	#resolved = new SvelteSet<number>();
	#generation = new Generation();

	isResolved(albumId: number): boolean {
		return this.#resolved.has(albumId);
	}

	async load({ albumIds }: { albumIds: number[] }): Promise<void> {
		const generation = this.#generation.next();
		this.#resolved.clear();
		await Promise.all(
			albumIds.map(async (albumId) => {
				let profileIds: number[] = [];
				try {
					({ profileIds } = await getAlbumShares(albumId));
				} catch (err) {
					console.error(err);
				}
				if (this.#generation.isStale(generation)) return;
				albumShares.record({ albumId, profileIds });
				this.#resolved.add(albumId);
			}),
		);
	}

	async update({
		albumId,
		profileId,
		shared,
	}: {
		albumId: number;
		profileId: number;
		shared: boolean;
	}): Promise<void> {
		const wasShared =
			albumShares.isSharedWith({ albumId, profileId }) ?? false;
		albumShares.set({ albumId, profileId, shared });
		try {
			if (shared) await shareAlbum({ albumId, profileIds: [profileId] });
			else await unshareAlbum({ albumId, profileIds: [profileId] });
		} catch (err) {
			albumShares.set({ albumId, profileId, shared: wasShared });
			throw err;
		}
	}
}
