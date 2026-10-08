import { accountScoped } from "$lib/api/account-caches";
import { getAlbumStorageLimits, getMyAlbums } from "$lib/api/messaging/albums";
import { Generation } from "$lib/util/generation";
import type { MyAlbum } from "$lib/model/messaging/albums";

async function loadMaxAlbums(): Promise<number | null> {
	try {
		return (await getAlbumStorageLimits()).maxAlbums;
	} catch (error) {
		console.error(error);
		return null;
	}
}

export class MyAlbumsState {
	albums = $state<MyAlbum[] | null>(null);
	maxAlbums = $state<number | null>(null);
	error = $state<unknown>(null);

	#generation = new Generation();
	#refreshing: { generation: number; done: Promise<void> } | null = null;

	refresh(): Promise<void> {
		if (this.#refreshing?.generation === this.#generation.current)
			return this.#refreshing.done;
		const generation = this.#generation.current;
		const done = this.#load(generation).finally(() => {
			if (this.#refreshing?.done === done) this.#refreshing = null;
		});
		this.#refreshing = { generation, done };
		return done;
	}

	reload(): Promise<void> {
		this.albums = null;
		this.error = null;
		return this.refresh();
	}

	remove(albumId: number): void {
		this.#generation.next();
		this.albums =
			this.albums?.filter((album) => album.albumId !== albumId) ?? null;
	}

	destroy(): void {
		this.#generation.next();
	}

	async #load(generation: number): Promise<void> {
		try {
			const [mine, maxAlbums] = await Promise.all([
				getMyAlbums(),
				loadMaxAlbums(),
			]);
			if (this.#generation.isStale(generation)) return;
			this.maxAlbums = maxAlbums;
			this.albums = mine.albums;
			this.error = null;
		} catch (error) {
			console.error(error);
			if (this.#generation.isStale(generation) || this.albums !== null)
				return;
			this.error = error;
		}
	}
}

export const getMyAlbumsState = accountScoped(() => new MyAlbumsState());
