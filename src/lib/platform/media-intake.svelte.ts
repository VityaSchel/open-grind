import { invoke } from "@tauri-apps/api/core";
import { type DragDropEvent, getCurrentWebview } from "@tauri-apps/api/webview";
import { untrack } from "svelte";
import { toast } from "svelte-sonner";
import z from "zod";
import type { Event } from "@tauri-apps/api/event";

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
import { isDesktopPlatform } from "$lib/platform/os";
import { toBase64 } from "$lib/util/base64";

const STAGE_CHUNK_BYTES = 4 * 1024 * 1024;

const UNREADABLE_MESSAGE = "Couldn't read that file";
const TOO_LARGE_MESSAGE = `Larger than the ${CHAT_MEDIA_MAX_LABEL} limit`;

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
let draggingFromPage = false;
let htmlDragDepth = 0;

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
	return mimeType === "" ? "unknown" : mediaFileKindOf(mimeType);
}

function draggedKindOfPath(path: string): DraggedKind {
	if (PATH_EXTENSION.test(path) && !MEDIA_PATH.test(path))
		return "unsupported";
	const kind = mediaFileKindOf(mimeTypeFromPath(path));
	return kind === "unsupported" ? "unknown" : kind;
}

function draggedKindsOf(event: DragEvent): DraggedKind[] {
	return Array.from(event.dataTransfer?.items ?? [])
		.filter((item) => item.kind === "file")
		.map((item) => draggedKindOfType(item.type));
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
	const nativeDrops = isDesktopPlatform()
		? getCurrentWebview().onDragDropEvent(onNativeDrag)
		: null;
	return () => {
		controller.abort();
		draggingFromPage = false;
		void nativeDrops?.then((unlisten) => unlisten());
	};
}

function onPaste(event: ClipboardEvent) {
	const target = targets.at(-1);
	const files = Array.from(event.clipboardData?.files ?? []);
	if (target === undefined || files.length === 0) return;
	event.preventDefault();
	void deliver({ target, files: withinSizeLimit(files) });
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

function carriesFiles(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes("Files") ?? false;
}

function onDragEnter(event: DragEvent) {
	if (draggingFromPage || !carriesFiles(event)) return;
	event.preventDefault();
	htmlDragDepth += 1;
	dragging = true;
	draggedKinds = draggedKindsOf(event);
}

function onDragOver(event: DragEvent) {
	if (draggingFromPage) return;
	if (!carriesFiles(event)) return;
	event.preventDefault();
	draggedKinds = draggedKindsOf(event);
	if (event.dataTransfer !== null) {
		const accepted = targets.length > 0 && mediaDrop.refusal === null;
		event.dataTransfer.dropEffect = accepted ? "copy" : "none";
	}
}

function onDragLeave(event: DragEvent) {
	if (draggingFromPage || !carriesFiles(event)) return;
	htmlDragDepth = Math.max(0, htmlDragDepth - 1);
	if (htmlDragDepth === 0) {
		dragging = false;
		draggedKinds = [];
	}
}

function onDrop(event: DragEvent) {
	if (draggingFromPage) return;
	if (!carriesFiles(event)) return;
	event.preventDefault();
	htmlDragDepth = 0;
	dragging = false;
	draggedKinds = [];
	const target = targets.at(-1);
	const files = Array.from(event.dataTransfer?.files ?? []);
	if (target === undefined || files.length === 0) return;
	void deliver({ target, files: withinSizeLimit(files) });
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
			target.receive(
				payload.paths.map(
					(path): PickedMedia => ({
						source: "desktop",
						key: crypto.randomUUID(),
						mimeType: mimeTypeFromPath(path),
						path,
					}),
				),
			);
		}
	}
}

async function deliver({
	target,
	files,
}: {
	target: Registration;
	files: File[];
}): Promise<void> {
	const staged: PickedMedia[] = [];
	for (const file of files) {
		try {
			staged.push(await stageFile(file));
		} catch (error) {
			console.error(error);
			toast.error(UNREADABLE_MESSAGE);
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
