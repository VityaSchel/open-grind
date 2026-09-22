import { toast } from "svelte-sonner";

import { accountScoped } from "$lib/api/account-caches";
import { httpStatusOf } from "$lib/api/api-error";
import {
	type AlbumContentResponse,
	getAlbumContent,
	getAlbumContentProcessing,
	getMyAlbums,
	uploadAlbumContent,
} from "$lib/api/messaging/albums";
import { asAppError, errorKindOf } from "$lib/api/methods";
import { albumMediaCounts } from "$lib/components/album/album";
import { forgetAlbumSlides } from "$lib/components/album/album-lightbox";
import { delay } from "$lib/util/delay";
import type {
	AlbumContent,
	AlbumStorageLimits,
} from "$lib/model/messaging/albums";
import type {
	MediaFileInspection,
	MediaFileKind,
} from "$lib/platform/media-file";
import type { PickedMedia } from "$lib/platform/media-picker";

type UploadKind = Exclude<MediaFileKind, "unsupported">;

export type InspectedPick = {
	media: PickedMedia;
	inspection: MediaFileInspection & { kind: UploadKind };
};

export type PendingUpload = { key: string; kind: UploadKind };

type UploadLanding = {
	land: (item: AlbumContent) => void;
	replace: (item: AlbumContent) => void;
	forget: (contentId: number) => void;
};

export type UploadLimits = Pick<
	AlbumStorageLimits,
	| "maxContentSize"
	| "maxContentSizeHumanReadable"
	| "maxContentItemsPerAlbum"
	| "maxVideosPerAlbum"
>;

type QueuedUpload = InspectedPick & { albumId: number; limits: UploadLimits };

const RECONCILE_INTERVAL_MS = 5_000;

const RECONCILE_ATTEMPTS = 12;

const PROCESSING_INTERVAL_MS = 2_500;

const PROCESSING_ATTEMPTS = 120;

const LOST_READ_MESSAGE = "Added. Reopen the album to see it";

export function isPlanLimitReached(error: unknown): boolean {
	return httpStatusOf(error) === 402;
}

function isSessionGone(error: unknown): boolean {
	const kind = errorKindOf(error);
	return kind === "SessionCleared" || kind === "NotSignedIn";
}

function isRefusal(error: unknown): boolean {
	const status = httpStatusOf(error);
	if (status !== null) return status < 500;
	const kind = errorKindOf(error);
	return kind === "ContentTooLarge" || kind === "Media";
}

function albumMediaErrorMessage({
	error,
	limits,
}: {
	error: unknown;
	limits: UploadLimits;
}): string | null {
	if (
		errorKindOf(error) === "ContentTooLarge" ||
		httpStatusOf(error) === 413
	) {
		return `Larger than the ${limits.maxContentSizeHumanReadable} limit`;
	}
	return null;
}

function refusalMessage({
	error,
	limits,
}: {
	error: unknown;
	limits: UploadLimits;
}): string | null {
	const tooLarge = albumMediaErrorMessage({ error, limits });
	if (tooLarge !== null) return tooLarge;
	if (errorKindOf(error) !== "Media") return null;
	const detail = asAppError(error)?.message;
	return typeof detail === "string" && detail !== "" ? detail : null;
}

function outOfRoomMessage({ inspection, limits }: QueuedUpload): string {
	const count =
		inspection.kind === "video"
			? limits.maxVideosPerAlbum
			: limits.maxContentItemsPerAlbum;
	const noun = inspection.kind === "video" ? "video" : "photo";
	return `This album already holds ${count} ${noun}${count === 1 ? "" : "s"}`;
}

function failureMessage(kind: UploadKind): string {
	return kind === "video" ? "Couldn't add video" : "Couldn't add photo";
}

class AlbumUploadsState {
	readonly #profileId: number;
	#queue = $state.raw<QueuedUpload[]>([]);
	#drafts = new Map<number, UploadLanding>();
	#landed = new Map<number, Set<number>>();
	#watching = new Set<string>();
	#epoch = 0;
	#destroyed = false;
	#running = false;

	constructor({ profileId }: { profileId: number }) {
		this.#profileId = profileId;
	}

	pending(albumId: number): PendingUpload[] {
		return this.#queue
			.filter((queued) => queued.albumId === albumId)
			.map(({ media, inspection }) => ({
				key: media.key,
				kind: inspection.kind,
			}));
	}

	hasPending(albumId: number): boolean {
		return this.#queue.some((queued) => queued.albumId === albumId);
	}

	attachDraft({
		albumId,
		draft,
	}: {
		albumId: number;
		draft: UploadLanding;
	}): void {
		this.#drafts.set(albumId, draft);
	}

	detachDraft({
		albumId,
		draft,
	}: {
		albumId: number;
		draft: UploadLanding;
	}): void {
		if (this.#drafts.get(albumId) === draft) this.#drafts.delete(albumId);
	}

	destroy(): void {
		this.#destroyed = true;
		this.#drop();
	}

	enqueue({
		albumId,
		inspected,
		limits,
		content,
	}: {
		albumId: number;
		inspected: InspectedPick[];
		limits: UploadLimits;
		content: AlbumContent[];
	}): { leftOutFull: number; leftOutVideoSlot: number } {
		let leftOutFull = 0;
		let leftOutVideoSlot = 0;
		if (this.#destroyed) return { leftOutFull, leftOutVideoSlot };
		const known = this.#landedIds(albumId);
		for (const item of content) known.add(item.contentId);

		let { photos, videos } = albumMediaCounts({
			content,
			pending: this.pending(albumId),
		});
		const accepted: QueuedUpload[] = [];
		for (const pick of [
			...inspected.filter(
				({ inspection }) => inspection.kind === "video",
			),
			...inspected.filter(
				({ inspection }) => inspection.kind === "photo",
			),
		]) {
			if (photos >= limits.maxContentItemsPerAlbum) {
				leftOutFull += 1;
				continue;
			}
			if (pick.inspection.kind === "video") {
				if (videos >= limits.maxVideosPerAlbum) {
					leftOutVideoSlot += 1;
					continue;
				}
				videos += 1;
			} else photos += 1;
			accepted.push({ ...pick, albumId, limits });
		}

		this.#queue = [...this.#queue, ...accepted];
		void this.#run();
		return { leftOutFull, leftOutVideoSlot };
	}

	#drop(): void {
		this.#epoch += 1;
		this.#queue = [];
		this.#drafts.clear();
		this.#landed.clear();
		this.#watching.clear();
	}

	#landedIds(albumId: number): Set<number> {
		const ids = this.#landed.get(albumId) ?? new Set<number>();
		this.#landed.set(albumId, ids);
		return ids;
	}

	async #run(): Promise<void> {
		if (this.#running) return;
		this.#running = true;
		try {
			for (
				let entry = this.#queue[0];
				entry !== undefined;
				entry = this.#queue[0]
			) {
				await this.#upload(entry);
				this.#queue = this.#queue.filter((queued) => queued !== entry);
			}
		} finally {
			this.#running = false;
		}
	}

	async #upload(entry: QueuedUpload): Promise<void> {
		const epoch = this.#epoch;
		const before = new Set(this.#landedIds(entry.albumId));
		let sha256: string | null = null;
		let contentId: number;
		try {
			({ contentId } = await uploadAlbumContent({
				albumId: entry.albumId,
				media: entry.media,
				inspection: entry.inspection,
				limits: entry.limits,
				profileId: this.#profileId,
				onHashed: (hash) => (sha256 = hash),
			}));
		} catch (error) {
			console.error(error);
			if (epoch === this.#epoch)
				await this.#recover({ entry, error, sha256, before });
			return;
		}
		if (epoch === this.#epoch)
			await this.#land({ albumId: entry.albumId, contentId });
	}

	async #recover({
		entry,
		error,
		sha256,
		before,
	}: {
		entry: QueuedUpload;
		error: unknown;
		sha256: string | null;
		before: Set<number>;
	}): Promise<void> {
		if (isSessionGone(error)) {
			this.#drop();
			return;
		}
		const epoch = this.#epoch;
		if (!isRefusal(error)) {
			const contentId = await this.#reconcile({
				albumId: entry.albumId,
				sha256,
				before,
			});
			if (epoch !== this.#epoch) return;
			if (contentId !== null) {
				await this.#land({ albumId: entry.albumId, contentId });
				return;
			}
		}
		if (isPlanLimitReached(error)) {
			this.#queue = this.#queue.filter(
				(queued) =>
					queued === entry ||
					queued.albumId !== entry.albumId ||
					queued.inspection.kind !== entry.inspection.kind,
			);
			toast.error(outOfRoomMessage(entry));
			return;
		}
		toast.error(
			refusalMessage({ error, limits: entry.limits }) ??
				failureMessage(entry.inspection.kind),
		);
	}

	async #reconcile({
		albumId,
		sha256,
		before,
	}: {
		albumId: number;
		sha256: string | null;
		before: Set<number>;
	}): Promise<number | null> {
		const epoch = this.#epoch;
		for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt += 1) {
			await delay(RECONCILE_INTERVAL_MS);
			if (epoch !== this.#epoch) return null;
			const albums = await getMyAlbums()
				.then((response) => response.albums)
				.catch(() => null);
			if (epoch !== this.#epoch) return null;
			if (albums === null) continue;
			const landed = albums
				.find((album) => album.albumId === albumId)
				?.content.find(
					(item) =>
						!before.has(item.contentId) &&
						(sha256 === null || item.contentHash === sha256),
				);
			if (landed !== undefined) return landed.contentId;
		}
		return null;
	}

	async #land({
		albumId,
		contentId,
	}: {
		albumId: number;
		contentId: number;
	}): Promise<void> {
		this.#landedIds(albumId).add(contentId);
		forgetAlbumSlides(albumId);
		const draft = this.#drafts.get(albumId);
		if (draft === undefined) return;
		const epoch = this.#epoch;
		const content = await this.#readContent(albumId);
		if (epoch !== this.#epoch) return;
		if (content === null) {
			toast.success(LOST_READ_MESSAGE);
			return;
		}
		const item = content.find((present) => present.contentId === contentId);
		if (item === undefined) return;
		draft.land(item);
		if (item.processing) void this.#watch({ albumId, contentId });
	}

	async #readContent(
		albumId: number,
	): Promise<AlbumContentResponse["content"] | null> {
		const epoch = this.#epoch;
		for (let attempt = 0; attempt <= RECONCILE_ATTEMPTS; attempt += 1) {
			if (attempt > 0) await delay(RECONCILE_INTERVAL_MS);
			if (epoch !== this.#epoch) return null;
			const content = await getAlbumContent(albumId)
				.then((response) => response.content)
				.catch((error: unknown) => {
					console.error(error);
					return null;
				});
			if (epoch !== this.#epoch) return null;
			if (content !== null) return content;
		}
		return null;
	}

	async #watch({
		albumId,
		contentId,
	}: {
		albumId: number;
		contentId: number;
	}): Promise<void> {
		const token = `${albumId}:${contentId}`;
		if (this.#watching.has(token)) return;
		this.#watching.add(token);
		const epoch = this.#epoch;
		try {
			for (let attempt = 0; attempt < PROCESSING_ATTEMPTS; attempt += 1) {
				await delay(PROCESSING_INTERVAL_MS);
				if (epoch !== this.#epoch) return;
				let processing: boolean;
				try {
					({ processing } = await getAlbumContentProcessing({
						albumId,
						contentId,
					}));
				} catch (error) {
					if (httpStatusOf(error) !== 404) continue;
					this.#drafts.get(albumId)?.forget(contentId);
					return;
				}
				if (processing) continue;
				await this.#processed({ albumId, contentId });
				return;
			}
		} finally {
			if (epoch === this.#epoch) this.#watching.delete(token);
		}
	}

	async #processed({
		albumId,
		contentId,
	}: {
		albumId: number;
		contentId: number;
	}): Promise<void> {
		const content = await this.#readContent(albumId);
		if (content === null) return;
		const draft = this.#drafts.get(albumId);
		const item = content.find((present) => present.contentId === contentId);
		if (item === undefined) {
			draft?.forget(contentId);
			return;
		}
		forgetAlbumSlides(albumId);
		draft?.replace(item);
	}
}

export type AlbumUploads = AlbumUploadsState;

export const getAlbumUploads = accountScoped(
	(profileId) => new AlbumUploadsState({ profileId }),
);
