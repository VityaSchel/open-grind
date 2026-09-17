import { toast } from "svelte-sonner";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

import { registerAccountCache } from "$lib/api/account-caches";
import { ApiError } from "$lib/api/api-error";
import {
	inspectMediaFile,
	type MediaFileInspection,
} from "$lib/api/media-file";
import {
	type AlbumContentResponse,
	albumMediaErrorMessage,
	getAlbumContent,
	getAlbumContentProcessing,
	getMyAlbums,
	uploadAlbumContent,
} from "$lib/api/messaging/albums";
import { asAppError, callMethod } from "$lib/api/methods";
import { isVideoContent } from "$lib/components/album/album";
import { forgetAlbumSlides } from "$lib/components/album/album-lightbox";
import type {
	AlbumContent,
	AlbumStorageLimits,
} from "$lib/model/messaging/albums";
import type { PickedMedia } from "$lib/platform/media-picker";

export type UploadKind = "photo" | "video";

export type PendingUpload = { key: string; kind: UploadKind };

export type UploadLanding = {
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

type QueuedUpload = {
	albumId: number;
	key: string;
	kind: UploadKind;
	media: PickedMedia;
	inspection: MediaFileInspection;
	limits: UploadLimits;
};

const RECONCILE_INTERVAL_MS = 5_000;

const RECONCILE_ATTEMPTS = 12;

const PROCESSING_INTERVAL_MS = 2_500;

const PROCESSING_ATTEMPTS = 120;

const UNSUPPORTED_MESSAGE = "That file isn't a photo or video";

const LOST_READ_MESSAGE = "Added. Reopen the album to see it";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentProfileId(): Promise<number | null> {
	return callMethod("auth_state").catch(() => null);
}

function errorKind(error: unknown) {
	return error instanceof ApiError ? error.kind : asAppError(error)?.kind;
}

function responseStatus(error: unknown): number | null {
	return error instanceof ApiError ? (error.response?.status ?? null) : null;
}

function isSessionGone(error: unknown): boolean {
	const kind = errorKind(error);
	return kind === "SessionCleared" || kind === "NotLoggedIn";
}

function isRefusal(error: unknown): boolean {
	const status = responseStatus(error);
	if (status !== null) return status < 500;
	const kind = errorKind(error);
	return kind === "ContentTooLarge" || kind === "Media";
}

function isOutOfRoom(error: unknown): boolean {
	return responseStatus(error) === 402;
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
	if (errorKind(error) !== "Media") return null;
	const detail = asAppError(error)?.message;
	return typeof detail === "string" && detail !== "" ? detail : null;
}

function outOfRoomMessage({ kind, limits }: QueuedUpload): string {
	const count =
		kind === "video"
			? limits.maxVideosPerAlbum
			: limits.maxContentItemsPerAlbum;
	const noun = kind === "video" ? "video" : "photo";
	return `This album already holds ${count} ${noun}${count === 1 ? "" : "s"}`;
}

function failureMessage(kind: UploadKind): string {
	return kind === "video" ? "Couldn't add video" : "Couldn't add photo";
}

export class AlbumUploads {
	#queue = $state<QueuedUpload[]>([]);
	#drafts = new SvelteMap<number, UploadLanding>();
	#landed = new SvelteMap<number, SvelteSet<number>>();
	#watching = new SvelteSet<string>();
	#profileId: number | null = null;
	#running = false;
	#generation = 0;

	pending(albumId: number): PendingUpload[] {
		return this.#queue
			.filter((queued) => queued.albumId === albumId)
			.map(({ key, kind }) => ({ key, kind }));
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

	clear(): void {
		this.#queue = [];
		this.#drafts.clear();
		this.#landed.clear();
		this.#watching.clear();
		this.#profileId = null;
		this.#generation += 1;
	}

	async enqueue({
		albumId,
		picked,
		limits,
		content,
	}: {
		albumId: number;
		picked: PickedMedia[];
		limits: UploadLimits;
		content: AlbumContent[];
	}): Promise<{ accepted: number; dropped: number }> {
		const profileId = await currentProfileId();
		if (profileId === null) return { accepted: 0, dropped: picked.length };
		if (this.#profileId !== null && this.#profileId !== profileId) {
			this.clear();
		}
		this.#profileId = profileId;
		const known = this.#landedIds(albumId);
		for (const item of content) known.add(item.contentId);

		let dropped = 0;
		const inspected: QueuedUpload[] = [];
		for (const media of picked) {
			const inspection = await inspectMediaFile(media).catch(() => null);
			if (inspection === null || inspection.kind === "unsupported") {
				dropped += 1;
				toast.error(UNSUPPORTED_MESSAGE);
				continue;
			}
			inspected.push({
				albumId,
				key: media.key,
				kind: inspection.kind,
				media,
				inspection,
				limits,
			});
		}

		let photos =
			content.filter((item) => !isVideoContent(item.contentType)).length +
			this.#pendingOfKind({ albumId, kind: "photo" });
		let videos =
			content.filter((item) => isVideoContent(item.contentType)).length +
			this.#pendingOfKind({ albumId, kind: "video" });
		const accepted: QueuedUpload[] = [];
		for (const entry of [
			...inspected.filter(({ kind }) => kind === "video"),
			...inspected.filter(({ kind }) => kind === "photo"),
		]) {
			if (entry.kind === "video") {
				if (videos >= limits.maxVideosPerAlbum) {
					dropped += 1;
					continue;
				}
				videos += 1;
			} else {
				if (photos >= limits.maxContentItemsPerAlbum) {
					dropped += 1;
					continue;
				}
				photos += 1;
			}
			accepted.push(entry);
		}

		this.#queue = [...this.#queue, ...accepted];
		void this.#run();
		return { accepted: accepted.length, dropped };
	}

	#pendingOfKind({
		albumId,
		kind,
	}: {
		albumId: number;
		kind: UploadKind;
	}): number {
		return this.#queue.filter(
			(queued) => queued.albumId === albumId && queued.kind === kind,
		).length;
	}

	#landedIds(albumId: number): SvelteSet<number> {
		const ids = this.#landed.get(albumId) ?? new SvelteSet<number>();
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
				const profileId = await currentProfileId();
				if (profileId === null || profileId !== this.#profileId) {
					this.clear();
					return;
				}
				await this.#upload({ entry, profileId });
				this.#queue = this.#queue.filter((queued) => queued !== entry);
			}
		} finally {
			this.#running = false;
		}
	}

	async #upload({
		entry,
		profileId,
	}: {
		entry: QueuedUpload;
		profileId: number;
	}): Promise<void> {
		const before = new SvelteSet(this.#landedIds(entry.albumId));
		let sha256: string | null = null;
		let contentId: number;
		try {
			({ contentId } = await uploadAlbumContent({
				albumId: entry.albumId,
				media: entry.media,
				inspection: entry.inspection,
				limits: entry.limits,
				profileId,
				onHashed: (hash) => (sha256 = hash),
			}));
		} catch (error) {
			console.error(error);
			await this.#recover({ entry, error, sha256, before });
			return;
		}
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
		before: SvelteSet<number>;
	}): Promise<void> {
		const generation = this.#generation;
		if (isSessionGone(error)) {
			this.clear();
			return;
		}
		if (!isRefusal(error)) {
			const contentId = await this.#reconcile({
				albumId: entry.albumId,
				sha256,
				before,
			});
			if (contentId !== null) {
				await this.#land({ albumId: entry.albumId, contentId });
				return;
			}
			if (generation !== this.#generation) return;
		}
		if (isOutOfRoom(error)) {
			this.#queue = this.#queue.filter(
				(queued) =>
					queued === entry ||
					queued.albumId !== entry.albumId ||
					queued.kind !== entry.kind,
			);
			toast.error(outOfRoomMessage(entry));
			return;
		}
		toast.error(
			refusalMessage({ error, limits: entry.limits }) ??
				failureMessage(entry.kind),
		);
	}

	async #reconcile({
		albumId,
		sha256,
		before,
	}: {
		albumId: number;
		sha256: string | null;
		before: SvelteSet<number>;
	}): Promise<number | null> {
		const generation = this.#generation;
		for (let attempt = 0; attempt < RECONCILE_ATTEMPTS; attempt += 1) {
			await delay(RECONCILE_INTERVAL_MS);
			if (generation !== this.#generation) return null;
			const albums = await getMyAlbums()
				.then((response) => response.albums)
				.catch(() => null);
			if (generation !== this.#generation) return null;
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
		const generation = this.#generation;
		const content = await this.#readContent(albumId);
		if (content === null) {
			if (generation === this.#generation)
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
		const generation = this.#generation;
		for (let attempt = 0; attempt <= RECONCILE_ATTEMPTS; attempt += 1) {
			if (attempt > 0) await delay(RECONCILE_INTERVAL_MS);
			if (generation !== this.#generation) return null;
			const content = await getAlbumContent(albumId)
				.then((response) => response.content)
				.catch((error: unknown) => {
					console.error(error);
					return null;
				});
			if (generation !== this.#generation) return null;
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
		const generation = this.#generation;
		try {
			for (let attempt = 0; attempt < PROCESSING_ATTEMPTS; attempt += 1) {
				await delay(PROCESSING_INTERVAL_MS);
				if (generation !== this.#generation) return;
				let processing: boolean;
				try {
					({ processing } = await getAlbumContentProcessing({
						albumId,
						contentId,
					}));
				} catch (error) {
					if (responseStatus(error) !== 404) continue;
					this.#drafts.get(albumId)?.forget(contentId);
					return;
				}
				if (processing) continue;
				await this.#processed({ albumId, contentId });
				return;
			}
		} finally {
			this.#watching.delete(token);
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

export const uploads = new AlbumUploads();

registerAccountCache({ reset: () => uploads.clear() });
