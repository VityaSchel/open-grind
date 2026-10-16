// @vitest-environment jsdom

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, platformMock, toastError, nativeDrop, systemDrag } =
	vi.hoisted(() => ({
		invokeMock: vi.fn(),
		platformMock: vi.fn(),
		toastError: vi.fn(),
		nativeDrop: { handler: null as ((event: unknown) => void) | null },
		systemDrag: { handler: null as ((event: unknown) => void) | null },
	}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("@tauri-apps/api/webview", () => ({
	getCurrentWebview: () => ({
		onDragDropEvent: (handler: (event: unknown) => void) => {
			nativeDrop.handler = handler;
			return Promise.resolve(() => {
				nativeDrop.handler = null;
			});
		},
	}),
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (_event: string, handler: (event: unknown) => void) => {
		systemDrag.handler = handler;
		return Promise.resolve(() => {
			systemDrag.handler = null;
		});
	},
}));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));

import { CHAT_MEDIA_MAX_BYTES } from "$lib/model/messaging/chat-media-limits";
import {
	listenForMedia,
	mediaDrop,
	type MediaTarget,
	receiveMedia,
	screenMedia,
} from "$lib/platform/media-intake.svelte";
import type { PickedMedia } from "$lib/platform/media-picker";

const tauri = globalThis as { isTauri?: boolean };

let stopListening: () => void;
let unregister: (() => void)[] = [];

function register(target: MediaTarget) {
	unregister.push(
		$effect.root(() => {
			receiveMedia(() => target);
		}),
	);
	flushSync();
}

function target(label = "Drop here", videos = true) {
	return { label, videos, receive: vi.fn<(media: PickedMedia[]) => void>() };
}

function png(bytes = 5) {
	return new File([new Uint8Array(bytes)], "pasted.png", {
		type: "image/png",
	});
}

function file(name: string, type: string) {
	return new File([new Uint8Array(3)], name, { type });
}

function paste(files: File[]) {
	const event = new Event("paste", { bubbles: true, cancelable: true });
	Object.defineProperty(event, "clipboardData", { value: { files } });
	document.body.dispatchEvent(event);
	return event;
}

function drag(type: string, files: File[] = []) {
	const event = new Event(type, { bubbles: true, cancelable: true });
	const items = files.map(({ type }) => ({ kind: "file", type }));
	Object.defineProperty(event, "dataTransfer", {
		value: { types: ["Files"], files, items, dropEffect: "none" },
	});
	window.dispatchEvent(event);
	return event as DragEvent & { dataTransfer: DataTransfer };
}

function dragMarkup(type: string, markup: string, uriList = "") {
	const event = new Event(type, { bubbles: true, cancelable: true });
	const data: Record<string, string> = {
		"text/html": markup,
		"text/uri-list": uriList,
	};
	Object.defineProperty(event, "dataTransfer", {
		value: {
			types: ["text/html", "text/plain"],
			files: [],
			getData: (format: string) => data[format] ?? "",
		},
	});
	window.dispatchEvent(event);
	return event;
}

function stagingSucceeds() {
	let next = 0;
	invokeMock.mockImplementation((command: string) => {
		if (command === "stage_media") {
			next += 1;
			return Promise.resolve(`staged-${next}`);
		}
		return Promise.resolve(undefined);
	});
}

beforeEach(() => {
	invokeMock.mockReset();
	toastError.mockReset();
	platformMock.mockReturnValue("android");
	stopListening = listenForMedia();
});

afterEach(() => {
	stopListening();
	for (const stop of unregister) stop();
	unregister = [];
	delete tauri.isTauri;
});

describe("pasting", () => {
	it("stages pasted files and hands them to the target", async () => {
		stagingSucceeds();
		const chat = target();
		register(chat);

		const event = paste([png()]);

		expect(event.defaultPrevented).toBe(true);
		await vi.waitFor(() => expect(chat.receive).toHaveBeenCalledOnce());
		expect(chat.receive.mock.calls[0]?.[0]).toEqual([
			expect.objectContaining({
				source: "staged",
				id: "staged-1",
				mimeType: "image/png",
			}),
		]);
		expect(invokeMock).toHaveBeenCalledWith("append_staged_media", {
			id: "staged-1",
			chunk: "AAAAAAA=",
		});
	});

	it("refuses files above the upload limit before copying them", async () => {
		stagingSucceeds();
		const chat = target();
		register(chat);
		const recording = new File([], "recording.mp4", { type: "video/mp4" });
		Object.defineProperty(recording, "size", {
			value: CHAT_MEDIA_MAX_BYTES + 1,
		});

		paste([recording, png()]);

		await vi.waitFor(() => expect(chat.receive).toHaveBeenCalledOnce());
		expect(chat.receive.mock.calls[0]?.[0]).toHaveLength(1);
		expect(toastError).toHaveBeenCalledWith(
			"Larger than the 120.00 MB limit",
		);
		expect(
			invokeMock.mock.calls.filter(
				([command]) => command === "stage_media",
			),
		).toHaveLength(1);
	});

	it("hands copied files to the target that registered again meanwhile", async () => {
		const copied = Promise.withResolvers<string>();
		invokeMock.mockImplementation((command: string) =>
			command === "stage_media" ? copied.promise : Promise.resolve(),
		);
		let label = $state("Drop to send");
		const receive = vi.fn<(media: PickedMedia[]) => void>();
		unregister.push(
			$effect.root(() => {
				receiveMedia(() => ({ label, videos: true, receive }));
			}),
		);
		flushSync();

		paste([png()]);
		label = "Drop to send now";
		flushSync();
		copied.resolve("staged-1");

		await vi.waitFor(() => expect(receive).toHaveBeenCalledOnce());
		expect(invokeMock).not.toHaveBeenCalledWith(
			"discard_staged_media",
			expect.anything(),
		);
	});

	it("leaves a paste without files to the text field", () => {
		register(target());

		const event = paste([]);

		expect(event.defaultPrevented).toBe(false);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("leaves pasted files alone where nothing takes media", () => {
		const event = paste([png()]);

		expect(event.defaultPrevented).toBe(false);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("gives media to the newest target and falls back when it leaves", async () => {
		stagingSucceeds();
		const album = target("Album");
		const chat = target("Chat");
		register(album);
		register(chat);

		paste([png()]);
		await vi.waitFor(() => expect(chat.receive).toHaveBeenCalledOnce());
		unregister.pop()?.();
		paste([png()]);
		await vi.waitFor(() => expect(album.receive).toHaveBeenCalledOnce());

		expect(chat.receive).toHaveBeenCalledOnce();
	});

	it("drops a file that can't be copied and discards what was written", async () => {
		invokeMock.mockImplementation((command: string) => {
			if (command === "stage_media") return Promise.resolve("staged-1");
			if (command === "append_staged_media") {
				return Promise.reject(new Error("disk full"));
			}
			return Promise.resolve(undefined);
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		const chat = target();
		register(chat);

		paste([png()]);

		await vi.waitFor(() =>
			expect(toastError).toHaveBeenCalledWith("Couldn't read that file"),
		);
		expect(invokeMock).toHaveBeenCalledWith("discard_staged_media", {
			id: "staged-1",
		});
		expect(chat.receive).not.toHaveBeenCalled();
	});
});

describe("dragging", () => {
	it("names the target while files are dragged over the window", () => {
		register(target("Drop to attach"));

		drag("dragenter");
		expect(mediaDrop.label).toBe("Drop to attach");

		drag("dragleave");
		expect(mediaDrop.label).toBeNull();
	});

	it("hands dropped files to the target and hides the overlay", async () => {
		stagingSucceeds();
		const album = target();
		register(album);

		drag("dragenter");
		const event = drag("drop", [png(), png(2)]);

		expect(event.defaultPrevented).toBe(true);
		expect(mediaDrop.label).toBeNull();
		await vi.waitFor(() => expect(album.receive).toHaveBeenCalledOnce());
		expect(album.receive.mock.calls[0]?.[0]).toHaveLength(2);
	});

	it("downloads an image a browser dragged in only as markup", async () => {
		invokeMock.mockResolvedValue({ id: "linked-1", mimeType: "image/png" });
		const chat = target();
		register(chat);
		const markup =
			'<meta charset="utf-8"><img src="https://example.org/cat.png" alt="cat">';

		expect(dragMarkup("dragover", markup).defaultPrevented).toBe(true);
		const event = dragMarkup("drop", markup);

		expect(event.defaultPrevented).toBe(true);
		await vi.waitFor(() =>
			expect(chat.receive).toHaveBeenCalledWith([
				expect.objectContaining({ source: "staged", id: "linked-1" }),
			]),
		);
		expect(invokeMock).toHaveBeenCalledWith("stage_linked_media", {
			url: "https://example.org/cat.png",
		});
	});

	it("finds a secure address for an image a page links relatively", async () => {
		invokeMock.mockResolvedValue({
			id: "linked-1",
			mimeType: "image/jpeg",
		});
		register(target());

		for (const [markup, uriList, expected] of [
			[
				'<img src="//cdn.example.org/a.jpg">',
				"",
				"https://cdn.example.org/a.jpg",
			],
			[
				'<img src="/a.jpg" srcset="https://cdn.example.org/a-2x.jpg 2x">',
				"",
				"https://cdn.example.org/a-2x.jpg",
			],
			[
				'<img src="data:image/gif;base64,R0lGOD" data-src="https://cdn.example.org/lazy.jpg">',
				"",
				"https://cdn.example.org/lazy.jpg",
			],
			[
				'<img src="a.jpg">',
				"# from the page\r\nhttps://example.org/a.jpg",
				"https://example.org/a.jpg",
			],
		] as const) {
			invokeMock.mockClear();
			dragMarkup("drop", markup, uriList);

			await vi.waitFor(() =>
				expect(invokeMock).toHaveBeenCalledWith("stage_linked_media", {
					url: expected,
				}),
			);
		}
	});

	it("says so when a dragged image has no secure address", () => {
		register(target());

		const event = dragMarkup(
			"drop",
			'<img src="http://example.org/a.jpg">',
		);

		expect(event.defaultPrevented).toBe(true);
		expect(toastError).toHaveBeenCalledWith("Couldn't download that image");
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("leaves a dragged link or text to the page", () => {
		register(target());

		const event = dragMarkup(
			"drop",
			'<a href="https://example.org/">example</a>',
		);

		expect(event.defaultPrevented).toBe(false);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("hides the overlay once a drag stops moving without a drop", () => {
		vi.useFakeTimers();
		try {
			register(target("Drop to attach"));

			drag("dragenter");
			drag("dragover");
			expect(mediaDrop.label).toBe("Drop to attach");
			vi.advanceTimersByTime(1_000);

			expect(mediaDrop.label).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves drags that start inside the page to the page", () => {
		register(target("Drop to send"));

		window.dispatchEvent(new Event("dragstart"));
		drag("dragenter", [png()]);
		const drop = drag("drop", [png()]);

		expect(mediaDrop.label).toBeNull();
		expect(drop.defaultPrevented).toBe(false);

		window.dispatchEvent(new Event("dragend"));
		drag("dragenter", [png()]);

		expect(mediaDrop.label).toBe("Drop to send");
	});

	it("refuses files that are no photo or video while they are still dragged", () => {
		register(target("Drop to send"));
		const documents = [
			file("notes.pdf", "application/pdf"),
			file("notes.txt", "text/plain"),
		];

		drag("dragenter", documents);
		const over = drag("dragover", documents);

		expect(mediaDrop.label).toBe("Drop to send");
		expect(mediaDrop.refusal).toBe(
			"Only photos and videos can be dropped here",
		);
		expect(over.dataTransfer.dropEffect).toBe("none");
	});

	it("turns videos away while dragged where only photos fit", () => {
		register(target("Drop to add photos", false));

		drag("dragenter", [file("clip.mp4", "video/mp4")]);

		expect(mediaDrop.refusal).toBe("Only photos can be dropped here");
	});

	it("lets a drag through when any file may be media or its type is hidden", () => {
		register(target("Drop to send"));

		for (const files of [
			[file("notes.pdf", "application/pdf"), png()],
			[file("clip.mp4", "video/mp4")],
			[file("photo.heic", "")],
			[],
		]) {
			drag("dragenter", files);
			const over = drag("dragover", files);

			expect(mediaDrop.refusal).toBeNull();
			expect(over.dataTransfer.dropEffect).toBe("copy");
			drag("dragleave");
		}
	});

	it("judges by the types Android reports when the webview hides them", () => {
		stopListening();
		tauri.isTauri = true;
		platformMock.mockReturnValue("android");
		stopListening = listenForMedia();
		register(target("Drop to send"));
		const hidden = [file("shared", "")];

		const verdictFor = (mimeTypes: string[]) => {
			systemDrag.handler?.({ payload: { mimeTypes } });
			drag("dragenter", hidden);
			const over = drag("dragover", hidden);
			const verdict = {
				refusal: mediaDrop.refusal,
				dropEffect: over.dataTransfer.dropEffect,
			};
			drag("dragleave");
			return verdict;
		};

		for (const mimeTypes of [
			["application/pdf"],
			["application/octet-stream"],
		]) {
			expect(verdictFor(mimeTypes), mimeTypes.join()).toEqual({
				refusal: "Only photos and videos can be dropped here",
				dropEffect: "none",
			});
		}
		for (const mimeTypes of [
			["image/jpeg"],
			["application/pdf", "video/mp4"],
			["*/*"],
			[],
		]) {
			expect(verdictFor(mimeTypes), mimeTypes.join()).toEqual({
				refusal: null,
				dropEffect: "copy",
			});
		}
	});

	it("stops the webview from opening a file dropped where nothing takes it", () => {
		const event = drag("drop", [png()]);

		expect(event.defaultPrevented).toBe(true);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	function onLinux() {
		stopListening();
		tauri.isTauri = true;
		platformMock.mockReturnValue("linux");
		stopListening = listenForMedia();
	}

	it("passes paths dropped on a Linux window straight to the target", async () => {
		onLinux();
		const chat = target("Drop to attach");
		register(chat);

		nativeDrop.handler?.({
			payload: { type: "enter", paths: ["/home/me/clip.mov"] },
		});
		expect(mediaDrop.label).toBe("Drop to attach");
		nativeDrop.handler?.({
			payload: { type: "drop", paths: ["/home/me/clip.mov"] },
		});

		expect(mediaDrop.label).toBeNull();
		await vi.waitFor(() =>
			expect(chat.receive).toHaveBeenCalledWith([
				expect.objectContaining({
					source: "desktop",
					path: "/home/me/clip.mov",
					mimeType: "video/quicktime",
				}),
			]),
		);
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("judges paths dragged over a Linux window by their extension", () => {
		onLinux();
		register(target("Drop to send"));

		const refusalFor = (paths: string[]) => {
			nativeDrop.handler?.({ payload: { type: "enter", paths } });
			const refusal = mediaDrop.refusal;
			nativeDrop.handler?.({ payload: { type: "leave", paths: [] } });
			return refusal;
		};

		expect(refusalFor(["/home/me/notes.pdf"])).toBe(
			"Only photos and videos can be dropped here",
		);
		for (const paths of [
			["/home/me/scan"],
			["/home/me/photo.HEIC"],
			["/home/me/notes.pdf", "/home/me/loop.gif"],
			["https://example.org/cat.webp?w=200"],
		]) {
			expect(refusalFor(paths), paths.join()).toBeNull();
		}
	});

	it("downloads an image dragged out of a browser on Linux", async () => {
		onLinux();
		invokeMock.mockResolvedValue({
			id: "linked-1",
			mimeType: "image/jpeg",
		});
		const chat = target();
		register(chat);

		nativeDrop.handler?.({
			payload: { type: "drop", paths: ["https://example.org/cat.jpg"] },
		});

		await vi.waitFor(() =>
			expect(chat.receive).toHaveBeenCalledWith([
				expect.objectContaining({
					source: "staged",
					id: "linked-1",
					mimeType: "image/jpeg",
				}),
			]),
		);
		expect(invokeMock).toHaveBeenCalledWith("stage_linked_media", {
			url: "https://example.org/cat.jpg",
		});
	});

	it("says why a dragged link couldn't be added", async () => {
		onLinux();
		vi.spyOn(console, "error").mockImplementation(() => {});
		invokeMock.mockRejectedValue({
			kind: "Media",
			message: "That link isn't a photo or video",
		});
		const chat = target();
		register(chat);

		nativeDrop.handler?.({
			payload: { type: "drop", paths: ["https://example.org/page"] },
		});

		await vi.waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"That link isn't a photo or video",
			),
		);
		expect(chat.receive).not.toHaveBeenCalled();
	});

	it("leaves macOS and Windows drops to the webview", () => {
		stopListening();
		tauri.isTauri = true;
		platformMock.mockReturnValue("macos");
		nativeDrop.handler = null;

		stopListening = listenForMedia();

		expect(nativeDrop.handler).toBeNull();
	});
});

describe("screenMedia", () => {
	function staged(id: string): PickedMedia {
		return { source: "staged", key: id, mimeType: null, id };
	}

	function inspections(byId: Record<string, object>) {
		invokeMock.mockImplementation(
			(command: string, args: { file?: { id: string } }) => {
				if (command === "inspect_media_file" && args.file) {
					return Promise.resolve(byId[args.file.id]);
				}
				return Promise.resolve(undefined);
			},
		);
	}

	beforeEach(() => {
		tauri.isTauri = true;
	});

	it("keeps photos, GIFs and videos and turns the rest away once", async () => {
		inspections({
			photo: { kind: "photo", size: 1 },
			gif: { kind: "photo", size: 1 },
			video: { kind: "video", size: 1 },
			pdf: { kind: "unsupported", size: 1 },
			zip: { kind: "unsupported", size: 1 },
		});

		const accepted = await screenMedia({
			media: ["photo", "gif", "video", "pdf", "zip"].map(staged),
			videos: true,
		});

		expect(accepted.map(({ media }) => media.key)).toEqual([
			"photo",
			"gif",
			"video",
		]);
		expect(toastError.mock.calls).toEqual([
			["That file isn't a photo or video"],
		]);
		for (const id of ["pdf", "zip"]) {
			expect(invokeMock).toHaveBeenCalledWith("discard_staged_media", {
				id,
			});
		}
	});

	it("turns videos away where only photos fit", async () => {
		inspections({
			photo: { kind: "photo", size: 1 },
			video: { kind: "video", size: 1 },
		});

		const accepted = await screenMedia({
			media: ["photo", "video"].map(staged),
			videos: false,
		});

		expect(accepted.map(({ media }) => media.key)).toEqual(["photo"]);
		expect(toastError).toHaveBeenCalledWith("Videos can't be added here");
	});
});
