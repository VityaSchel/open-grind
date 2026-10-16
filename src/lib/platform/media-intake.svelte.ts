import { invoke } from "@tauri-apps/api/core";
import { type Event, listen } from "@tauri-apps/api/event";
import { type DragDropEvent, getCurrentWebview } from "@tauri-apps/api/webview";
import { untrack } from "svelte";
import { toast } from "svelte-sonner";
import z from "zod";

import { demoEnabled } from "$lib/demo";
import {
	CHAT_MEDIA_MAX_BYTES,
	CHAT_MEDIA_MAX_LABEL,
} from "$lib/model/messaging/chat-media-limits";
import {
	discardStagedMedia,
	inspectMediaFile,
	type MediaFileInspection,
	type MediaFileKind,
	mediaFileKindOf,
} from "$lib/platform/media-file";
import { mimeTypeFromPath, type PickedMedia } from "$lib/platform/media-picker";
import { isAndroidPlatform, isLinuxPlatform } from "$lib/platform/os";
import { toBase64 } from "$lib/util/base64";

const STAGE_CHUNK_BYTES = 4 * 1024 * 1024;

const DRAG_IDLE_MS = 1_000;

const LINK = /^https?:\/\//i;
const SECURE_LINK = /^https:\/\//i;

const UNREADABLE_MESSAGE = "Couldn't read that file";
const LINK_FAILED_MESSAGE = "Couldn't download that image";
const TOO_LARGE_MESSAGE = `Larger than the ${CHAT_MEDIA_MAX_LABEL} limit`;

const stagedLinkSchema = z.object({ id: z.string(), mimeType: z.string() });

const mediaRefusalSchema = z.object({
	kind: z.literal("Media"),
	message: z.string(),
});

const rejections = {
	unsupported: "That file isn't a photo or video",
	video: "Videos can't be added here",
} as const;

type Rejection = keyof typeof rejections;

const dragRefusals = {
	unsupported: "Only photos and videos can be dropped here",
	video: "Only photos can be dropped here",
} as const satisfies Record<Rejection, string>;

const MEDIA_PATH =
	/\.(jpe?g|jfif|png|webp|gif|heic|heif|bmp|tiff?|mp4|mov|m4v|3gp)$/i;

const PATH_EXTENSION = /\.[^./\\]+$/;

const UNTYPED = new Set(["", "*/*"]);

const MEDIA_DRAG_EVENT = "media-drag";

const mediaDragSchema = z.object({ mimeTypes: z.array(z.string()) });

export type MediaTarget = {
	label: string;
	videos: boolean;
	receive: (media: PickedMedia[]) => void;
};

export type ScreenedMedia = {
	media: PickedMedia;
	inspection: MediaFileInspection & { kind: "photo" | "video" };
};

type DraggedKind = MediaFileKind | "unknown";

type Registration = MediaTarget & { owner: object };

let targets = $state.raw<Registration[]>([]);
let dragging = $state(false);
let draggedKinds = $state.raw<DraggedKind[]>([]);
let systemDragKinds: DraggedKind[] = [];
let draggingFromPage = false;
let htmlDragDepth = 0;
let dragIdle: ReturnType<typeof setTimeout> | undefined;

export const mediaDrop = {
	get label(): string | null {
		return dragging ? (targets.at(-1)?.label ?? null) : null;
	},
	get refusal(): string | null {
		const target = targets.at(-1);
		if (!dragging || target === undefined) return null;
		const rejection = dragRejection({
			kinds: draggedKinds,
			videos: target.videos,
		});
		return rejection === null ? null : dragRefusals[rejection];
	},
};

export function dragRejection({
	kinds,
	videos,
}: {
	kinds: readonly DraggedKind[];
	videos: boolean;
}): Rejection | null {
	if (kinds.length === 0 || kinds.includes("unknown")) return null;
	if (kinds.includes("photo")) return null;
	if (kinds.includes("video")) return videos ? null : "video";
	return "unsupported";
}

function draggedKindOfType(mimeType: string): DraggedKind {
	return UNTYPED.has(mimeType) ? "unknown" : mediaFileKindOf(mimeType);
}

function draggedKindOfPath(path: string): DraggedKind {
	if (!LINK.test(path) && PATH_EXTENSION.test(path) && !MEDIA_PATH.test(path))
		return "unsupported";
	const kind = mediaFileKindOf(mimeTypeFromPath(path));
	return kind === "unsupported" ? "unknown" : kind;
}

function draggedKindsOf(event: DragEvent): DraggedKind[] {
	const kinds = Array.from(event.dataTransfer?.items ?? [])
		.filter((item) => item.kind === "file")
		.map((item) => draggedKindOfType(item.type));
	const typed = kinds.length > 0 && !kinds.includes("unknown");
	return typed || systemDragKinds.length === 0 ? kinds : systemDragKinds;
}

export function receiveMedia(target: () => MediaTarget | null): void {
	const owner = {};
	$effect(() => {
		const current = target();
		if (current === null) return;
		const registration = { ...current, owner };
		targets = [...untrack(() => targets), registration];
		return () => {
			targets = targets.filter((other) => other !== registration);
		};
	});
}

export function listenForMedia(): () => void {
	const controller = new AbortController();
	const options = { signal: controller.signal };
	document.addEventListener("paste", onPaste, options);
	window.addEventListener("dragstart", onDragStart, options);
	window.addEventListener("dragend", onDragEnd, options);
	window.addEventListener("dragenter", onDragEnter, options);
	window.addEventListener("dragover", onDragOver, options);
	window.addEventListener("dragleave", onDragLeave, options);
	window.addEventListener("drop", onDrop, options);
	const nativeDrops = isLinuxPlatform()
		? getCurrentWebview().onDragDropEvent(onNativeDrag)
		: null;
	const systemDrags = isAndroidPlatform()
		? listen(MEDIA_DRAG_EVENT, ({ payload }) => {
				systemDragKinds = mediaDragSchema
					.parse(payload)
					.mimeTypes.map(draggedKindOfType);
			})
		: null;
	return () => {
		controller.abort();
		hideDrag();
		systemDragKinds = [];
		draggingFromPage = false;
		void nativeDrops?.then((unlisten) => unlisten());
		void systemDrags?.then((unlisten) => unlisten());
	};
}

function onPaste(event: ClipboardEvent) {
	const target = targets.at(-1);
	const files = Array.from(event.clipboardData?.files ?? []);
	if (target === undefined || files.length === 0) return;
	event.preventDefault();
	void deliver({
		target,
		items: withinSizeLimit(files),
		stage: stageFile,
		failure: () => UNREADABLE_MESSAGE,
	});
}

function withinSizeLimit(files: File[]): File[] {
	const fitting = files.filter((file) => file.size <= CHAT_MEDIA_MAX_BYTES);
	if (fitting.length < files.length) toast.error(TOO_LARGE_MESSAGE);
	return fitting;
}

function onDragStart() {
	draggingFromPage = true;
}

function onDragEnd() {
	draggingFromPage = false;
}

function draggedTypes(event: DragEvent): readonly string[] {
	return event.dataTransfer?.types ?? [];
}

function carriesFiles(event: DragEvent): boolean {
	return draggedTypes(event).includes("Files");
}

function carriesMarkup(event: DragEvent): boolean {
	return !carriesFiles(event) && draggedTypes(event).includes("text/html");
}

function showDrag(kinds: DraggedKind[]) {
	dragging = true;
	draggedKinds = kinds;
	clearTimeout(dragIdle);
	dragIdle = setTimeout(hideDrag, DRAG_IDLE_MS);
}

function hideDrag() {
	clearTimeout(dragIdle);
	htmlDragDepth = 0;
	dragging = false;
	draggedKinds = [];
}

function onDragEnter(event: DragEvent) {
	if (draggingFromPage || !carriesFiles(event)) return;
	event.preventDefault();
	htmlDragDepth += 1;
	showDrag(draggedKindsOf(event));
}

function onDragOver(event: DragEvent) {
	if (draggingFromPage) return;
	if (carriesMarkup(event) && targets.length > 0) {
		event.preventDefault();
		return;
	}
	if (!carriesFiles(event)) return;
	event.preventDefault();
	showDrag(draggedKindsOf(event));
	if (event.dataTransfer !== null) {
		const accepted = targets.length > 0 && mediaDrop.refusal === null;
		event.dataTransfer.dropEffect = accepted ? "copy" : "none";
	}
}

function onDragLeave(event: DragEvent) {
	if (draggingFromPage || !carriesFiles(event)) return;
	htmlDragDepth = Math.max(0, htmlDragDepth - 1);
	if (htmlDragDepth === 0) hideDrag();
}

function onDrop(event: DragEvent) {
	if (draggingFromPage) return;
	const target = targets.at(-1);
	if (carriesMarkup(event)) {
		const source = imageSourceOf(event);
		if (target === undefined || source === undefined) return;
		event.preventDefault();
		if (source === null) {
			toast.error(LINK_FAILED_MESSAGE);
			return;
		}
		void deliver({
			target,
			items: [source],
			stage: stageLink,
			failure: linkFailure,
		});
		return;
	}
	if (!carriesFiles(event)) return;
	event.preventDefault();
	hideDrag();
	const files = Array.from(event.dataTransfer?.files ?? []);
	if (target === undefined || files.length === 0) return;
	void deliver({
		target,
		items: withinSizeLimit(files),
		stage: stageFile,
		failure: () => UNREADABLE_MESSAGE,
	});
}

function secureLink(source: string | null | undefined): string | null {
	const link = source?.trim().replace(/^\/\//, "https://") ?? "";
	return SECURE_LINK.test(link) ? link : null;
}

function imageSourceOf(event: DragEvent): string | null | undefined {
	const data = event.dataTransfer;
	const image = new DOMParser()
		.parseFromString(data?.getData("text/html") ?? "", "text/html")
		.querySelector("img");
	if (image === null) return undefined;
	const listed = (data?.getData("text/uri-list") ?? "")
		.split(/\r?\n/)
		.find((line) => line !== "" && !line.startsWith("#"));
	const candidates = [
		image.getAttribute("src"),
		image.getAttribute("srcset")?.split(",")[0]?.trim().split(/\s+/)[0],
		image.getAttribute("data-src"),
		listed,
	];
	return candidates.map(secureLink).find((link) => link !== null) ?? null;
}

function onNativeDrag({ payload }: Event<DragDropEvent>) {
	if (draggingFromPage) return;
	switch (payload.type) {
		case "enter":
			dragging = payload.paths.length > 0;
			draggedKinds = payload.paths.map(draggedKindOfPath);
			return;
		case "over":
			return;
		case "leave":
			dragging = false;
			draggedKinds = [];
			return;
		case "drop": {
			dragging = false;
			draggedKinds = [];
			const target = targets.at(-1);
			if (target === undefined || payload.paths.length === 0) return;
			void deliver({
				target,
				items: payload.paths,
				stage: stagePath,
				failure: linkFailure,
			});
		}
	}
}

function linkFailure(error: unknown): string {
	const refusal = mediaRefusalSchema.safeParse(error);
	return refusal.success ? refusal.data.message : LINK_FAILED_MESSAGE;
}

async function stageLink(url: string): Promise<PickedMedia> {
	const { id, mimeType } = stagedLinkSchema.parse(
		await invoke("stage_linked_media", { url }),
	);
	return { source: "staged", key: crypto.randomUUID(), mimeType, id };
}

async function stagePath(path: string): Promise<PickedMedia> {
	if (LINK.test(path)) return stageLink(path);
	return {
		source: "desktop",
		key: crypto.randomUUID(),
		mimeType: mimeTypeFromPath(path),
		path,
	};
}

async function deliver<T>({
	target,
	items,
	stage,
	failure,
}: {
	target: Registration;
	items: T[];
	stage: (item: T) => Promise<PickedMedia>;
	failure: (error: unknown) => string;
}): Promise<void> {
	const staged: PickedMedia[] = [];
	for (const item of items) {
		try {
			staged.push(await stage(item));
		} catch (error) {
			console.error(error);
			toast.error(failure(error));
		}
	}
	if (staged.length === 0) return;
	const current = targets.findLast((other) => other.owner === target.owner);
	if (current !== undefined) {
		current.receive(staged);
		return;
	}
	await discardStagedMedia(staged);
}

async function stageFile(file: File): Promise<PickedMedia> {
	const key = crypto.randomUUID();
	const mimeType = file.type === "" ? null : file.type;
	if (demoEnabled) return { source: "web", key, mimeType, file };
	const id = z.string().parse(await invoke("stage_media"));
	const media: PickedMedia = { source: "staged", key, mimeType, id, file };
	try {
		for (let offset = 0; offset < file.size; offset += STAGE_CHUNK_BYTES) {
			const chunk = await file
				.slice(offset, offset + STAGE_CHUNK_BYTES)
				.arrayBuffer();
			await invoke("append_staged_media", {
				id,
				chunk: toBase64(new Uint8Array(chunk)),
			});
		}
	} catch (error) {
		await discardStagedMedia([media]);
		throw error;
	}
	return media;
}

function isUploadable(
	inspection: MediaFileInspection | null,
): inspection is ScreenedMedia["inspection"] {
	return inspection !== null && inspection.kind !== "unsupported";
}

function rejectionOf({
	inspection,
	videos,
}: {
	inspection: MediaFileInspection | null;
	videos: boolean;
}): Rejection | null {
	if (!isUploadable(inspection)) return "unsupported";
	if (inspection.kind === "video" && !videos) return "video";
	return null;
}

export async function screenMedia({
	media,
	videos,
}: {
	media: PickedMedia[];
	videos: boolean;
}): Promise<ScreenedMedia[]> {
	const accepted: ScreenedMedia[] = [];
	const refused: { media: PickedMedia; rejection: Rejection }[] = [];
	for (const item of media) {
		const inspection = await inspectMediaFile(item).catch(
			(error: unknown) => {
				console.error(error);
				return null;
			},
		);
		const rejection = rejectionOf({ inspection, videos });
		if (rejection === null && isUploadable(inspection)) {
			accepted.push({ media: item, inspection });
			continue;
		}
		refused.push({ media: item, rejection: rejection ?? "unsupported" });
	}
	for (const [rejection, message] of Object.entries(rejections)) {
		if (refused.some((item) => item.rejection === rejection)) {
			toast.error(message);
		}
	}
	await discardStagedMedia(refused.map((item) => item.media));
	return accepted;
}
