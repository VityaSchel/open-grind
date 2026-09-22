import { format } from "date-fns";

import { httpStatusOf } from "$lib/api/api-error";
import {
	deleteAlbumContent,
	getAlbumContent,
	renameAlbum,
	reorderAlbumContent,
} from "$lib/api/messaging/albums";
import { forgetAlbumSlides } from "$lib/components/album/album-lightbox";
import { now } from "$lib/util/clock";
import { deepEqual } from "$lib/util/deep-equal";
import { moveItem } from "$lib/util/reorder";
import type { AlbumContent } from "$lib/model/messaging/albums";

function idsOf(content: AlbumContent[]): number[] {
	return content.map((item) => item.contentId);
}

export class StillProcessingError extends Error {}

export class AlbumDraftState {
	readonly albumId: number;

	#savedName = $state("");
	#savedOrder = $state<number[]>([]);
	#uploadsPending: () => boolean;

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
		uploadsPending = () => false,
	}: {
		albumId: number;
		albumName: string | null;
		updatedAt: string;
		content: AlbumContent[];
		uploadsPending?: () => boolean;
	}) {
		this.albumId = albumId;
		this.updatedAt = updatedAt;
		this.#savedName = albumName ?? "";
		this.#savedOrder = idsOf(content);
		this.#uploadsPending = uploadsPending;
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
			!deepEqual(idsOf(this.content), this.#savedOrder)
		);
	}

	get canSave(): boolean {
		return this.dirty && !this.saving && !this.#uploadsPending();
	}

	#isRemoved(contentId: number): boolean {
		return this.removed.includes(contentId);
	}

	toggleRemoved(contentId: number): void {
		this.removed = this.#isRemoved(contentId)
			? this.removed.filter((id) => id !== contentId)
			: [...this.removed, contentId];
	}

	move(positions: { from: number; to: number }): void {
		this.content = moveItem({ items: this.content, ...positions });
	}

	land(item: AlbumContent): void {
		const { contentId } = item;
		if (this.content.some((present) => present.contentId === contentId)) {
			this.removed = this.removed.filter((id) => id !== contentId);
			return;
		}
		this.content = [item, ...this.content];
		this.#savedOrder = [contentId, ...this.#savedOrder];
	}

	replace(item: AlbumContent): void {
		this.content = this.content.map((present) =>
			present.contentId === item.contentId ? item : present,
		);
	}

	forget(contentId: number): void {
		this.content = this.content.filter(
			(item) => item.contentId !== contentId,
		);
		this.#savedOrder = this.#savedOrder.filter((id) => id !== contentId);
		this.removed = this.removed.filter((id) => id !== contentId);
	}

	async #listedByServer(contentId: number): Promise<boolean> {
		const { content } = await getAlbumContent(this.albumId);
		return content.some((item) => item.contentId === contentId);
	}

	async save(): Promise<void> {
		if (!this.canSave) return;
		this.saving = true;
		try {
			const { albumId } = this;
			let refusedWhileProcessing = false;
			let landed = false;
			try {
				for (const contentId of [...this.removed]) {
					if (!this.#isRemoved(contentId)) continue;
					try {
						await deleteAlbumContent({ albumId, contentId });
					} catch (error) {
						if (!this.#isProcessingRefusal({ error, contentId }))
							throw error;
						refusedWhileProcessing = true;
						continue;
					}
					landed = true;
					if (
						this.#isRemoved(contentId) ||
						!(await this.#listedByServer(contentId))
					) {
						this.forget(contentId);
					}
				}
			} finally {
				if (landed) forgetAlbumSlides(albumId);
			}
			const contentIds = idsOf(this.content);
			if (!deepEqual(contentIds, this.#savedOrder)) {
				await reorderAlbumContent({ albumId, contentIds });
				const landedMeanwhile = this.#savedOrder.filter(
					(id) => !contentIds.includes(id),
				);
				const stillListed = contentIds.filter((id) =>
					this.#savedOrder.includes(id),
				);
				this.#savedOrder = [...landedMeanwhile, ...stillListed];
				forgetAlbumSlides(albumId);
				landed = true;
			}
			const named = this.name;
			if (named !== this.#savedName) {
				await renameAlbum({ albumId, albumName: named || null });
				this.#savedName = named;
				landed = true;
			}
			if (landed) this.updatedAt = format(now(), "yyyy-MM-dd'T'HH:mm:ss");
			if (refusedWhileProcessing) throw new StillProcessingError();
		} finally {
			this.saving = false;
		}
	}

	#isProcessingRefusal({
		error,
		contentId,
	}: {
		error: unknown;
		contentId: number;
	}): boolean {
		return (
			httpStatusOf(error) === 400 &&
			this.content.some(
				(item) => item.contentId === contentId && item.processing,
			)
		);
	}
}
