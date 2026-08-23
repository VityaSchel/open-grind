import { SvelteSet } from "svelte/reactivity";

import {
	getAlbumShares,
	shareAlbum,
	unshareAlbum,
} from "$lib/api/messaging/albums";

async function isSharedWith({
	albumId,
	profileId,
}: {
	albumId: number;
	profileId: number;
}): Promise<boolean> {
	try {
		const { profileIds } = await getAlbumShares(albumId);
		return profileIds.includes(profileId);
	} catch (err) {
		console.error(err);
		return false;
	}
}

export class AlbumShares {
	#shared = new SvelteSet<number>();
	#resolved = new SvelteSet<number>();
	#generation = 0;

	has(albumId: number): boolean {
		return this.#shared.has(albumId);
	}

	isResolved(albumId: number): boolean {
		return this.#resolved.has(albumId);
	}

	async load({
		albumIds,
		profileId,
	}: {
		albumIds: number[];
		profileId: number;
	}): Promise<void> {
		const generation = ++this.#generation;
		this.#shared.clear();
		this.#resolved.clear();
		await Promise.all(
			albumIds.map(async (albumId) => {
				const shared = await isSharedWith({ albumId, profileId });
				if (generation !== this.#generation) return;
				this.#set({ albumId, shared });
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
		const wasShared = this.has(albumId);
		this.#set({ albumId, shared });
		try {
			if (shared) await shareAlbum({ albumId, profileIds: [profileId] });
			else await unshareAlbum({ albumId, profileIds: [profileId] });
		} catch (err) {
			this.#set({ albumId, shared: wasShared });
			throw err;
		}
	}

	#set({ albumId, shared }: { albumId: number; shared: boolean }): void {
		if (shared) this.#shared.add(albumId);
		else this.#shared.delete(albumId);
	}
}
