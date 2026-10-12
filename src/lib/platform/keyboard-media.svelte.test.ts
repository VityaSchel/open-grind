import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, platformMock, toastError, keyboard } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	platformMock: vi.fn(),
	toastError: vi.fn(),
	keyboard: { emit: null as ((event: { payload: unknown }) => void) | null },
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));
vi.mock("@tauri-apps/api/event", () => ({
	listen: (
		_event: string,
		handler: (event: { payload: unknown }) => void,
	) => {
		keyboard.emit = handler;
		return Promise.resolve(() => {
			keyboard.emit = null;
		});
	},
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("svelte-sonner", () => ({ toast: { error: toastError } }));

import {
	listenForKeyboardMedia,
	receiveKeyboardMedia,
} from "$lib/platform/keyboard-media.svelte";
import type { PickedMedia } from "$lib/platform/media-picker";

const tauri = globalThis as { isTauri?: boolean };

let stop: () => void;
let unregister: (() => void) | null = null;

function chat() {
	const receive = vi.fn<(media: PickedMedia) => void>();
	unregister = $effect.root(() => {
		receiveKeyboardMedia(() => receive);
	});
	flushSync();
	return receive;
}

function insert(payload: object) {
	keyboard.emit?.({
		payload: { id: "kb-1", mimeType: "image/png", ...payload },
	});
}

beforeEach(() => {
	tauri.isTauri = true;
	platformMock.mockReturnValue("android");
	invokeMock.mockReset();
	toastError.mockReset();
	stop = listenForKeyboardMedia();
});

afterEach(() => {
	stop();
	unregister?.();
	unregister = null;
	delete tauri.isTauri;
});

describe("keyboard media", () => {
	it("hands what the keyboard sent to the open chat", () => {
		const receive = chat();

		insert({ mimeType: "image/gif" });

		expect(receive).toHaveBeenCalledWith({
			source: "staged",
			key: expect.any(String),
			mimeType: "image/gif",
			id: "kb-1",
		});
	});

	it("drops an insert outside a chat and says where stickers go", async () => {
		insert({});

		await vi.waitFor(() =>
			expect(invokeMock).toHaveBeenCalledWith("discard_staged_media", {
				id: "kb-1",
			}),
		);
		expect(toastError).toHaveBeenCalledWith(
			"Stickers can only be sent in a chat",
		);
	});

	it("reports an insert the keyboard failed to hand over", () => {
		const receive = chat();

		insert({ id: null });

		expect(toastError).toHaveBeenCalledWith(
			"Couldn't read what the keyboard sent",
		);
		expect(receive).not.toHaveBeenCalled();
	});
});
