import { format } from "date-fns";

import {
	deleteAlbumContent,
	renameAlbum,
	reorderAlbumContent,
} from "$lib/api/messaging/albums";
import { forgetAlbumSlides } from "$lib/components/album/album-lightbox";
import { now } from "$lib/util/clock";
import { moveItem } from "$lib/util/reorder";
import type { AlbumContent } from "$lib/model/messaging/albums";

function sameOrder(left: AlbumContent[], right: AlbumContent[]): boolean {
	return (
		left.length === right.length &&
		left.every((item, index) => item.contentId === right[index]?.contentId)
	);
}

export class AlbumDraft {
	readonly albumId: number;

	#savedName = $state("");
	#savedContent: AlbumContent[] = $state([]);

	name = $state("");
	updatedAt = $state("");
	content: AlbumContent[] = $state([]);
	removed = $state<number[]>([]);
	saving = $state(false);

	constructor({
		albumId,
		albumName,
		updatedAt,
		content,
	}: {
		albumId: number;
		albumName: string | null;
		updatedAt: string;
		content: AlbumContent[];
	}) {
		this.albumId = albumId;
		this.updatedAt = updatedAt;
		this.#savedName = albumName ?? "";
		this.#savedContent = content;
		this.name = this.#savedName;
		this.content = content;
	}

	get remaining(): AlbumContent[] {
		return this.content.filter(
			(item) => !this.removed.includes(item.contentId),
		);
	}

	get dirty(): boolean {
		return (
			this.name !== this.#savedName ||
			this.removed.length > 0 ||
			!sameOrder(this.content, this.#savedContent)
		);
	}

	isRemoved(contentId: number): boolean {
		return this.removed.includes(contentId);
	}

	toggleRemoved(contentId: number): void {
		this.removed = this.isRemoved(contentId)
			? this.removed.filter((id) => id !== contentId)
			: [...this.removed, contentId];
	}

	move(positions: { from: number; to: number }): void {
		this.content = moveItem({ items: this.content, ...positions });
	}

	async save(): Promise<void> {
		if (this.saving || !this.dirty) return;
		this.saving = true;
		try {
			const { albumId } = this;
			for (const contentId of [...this.removed]) {
				await deleteAlbumContent({ albumId, contentId });
				const survives = (item: AlbumContent) =>
					item.contentId !== contentId;
				this.#savedContent = this.#savedContent.filter(survives);
				this.content = this.content.filter(survives);
				this.removed = this.removed.filter((id) => id !== contentId);
				forgetAlbumSlides(albumId);
			}
			const ordered = [...this.content];
			if (!sameOrder(ordered, this.#savedContent)) {
				await reorderAlbumContent({
					albumId,
					contentIds: ordered.map((item) => item.contentId),
				});
				this.#savedContent = ordered;
				forgetAlbumSlides(albumId);
			}
			const named = this.name;
			if (named !== this.#savedName) {
				await renameAlbum({ albumId, albumName: named || null });
				this.#savedName = named;
			}
			this.updatedAt = format(now(), "yyyy-MM-dd'T'HH:mm:ss");
		} finally {
			this.saving = false;
		}
	}
}
