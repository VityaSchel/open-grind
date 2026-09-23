import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fromBase64 } from "$lib/util/base64";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

import {
	existsAppDataFile,
	readAppDataFile,
	removeAppDataFile,
	writeAppDataFileAtomic,
} from ".";

const tauri = globalThis as { isTauri?: boolean };

function nativeBackend({
	deliver = (bytes: Uint8Array): unknown => bytes.slice().buffer,
} = {}) {
	const files = new Map<string, Uint8Array>();
	invokeMock.mockImplementation(
		(command: string, args: { file: string; content?: string }) => {
			if (args.file !== "preferences") {
				return Promise.reject(new Error(`unknown file ${args.file}`));
			}
			if (command === "read_app_data") {
				const stored = files.get(args.file);
				return Promise.resolve(
					stored === undefined ? null : deliver(stored),
				);
			}
			if (command === "write_app_data") {
				files.set(args.file, fromBase64(args.content ?? ""));
				return Promise.resolve(null);
			}
			if (command === "remove_app_data") {
				files.delete(args.file);
				return Promise.resolve(null);
			}
			return Promise.reject(new Error(`unexpected command ${command}`));
		},
	);
	return files;
}

const content = Uint8Array.from({ length: 256 }, (_, index) => index);

beforeEach(() => {
	invokeMock.mockReset();
	localStorage.clear();
});

afterEach(() => {
	delete tauri.isTauri;
});

describe("in the native app", () => {
	beforeEach(() => {
		tauri.isTauri = true;
	});

	it("reads back every byte it wrote", async () => {
		nativeBackend();

		await writeAppDataFileAtomic({ path: "preferences.data", content });

		expect(await existsAppDataFile("preferences.data")).toBe(true);
		expect(await readAppDataFile("preferences.data")).toEqual(content);
	});

	it("reads the plain byte array a bridge may deliver instead of a buffer", async () => {
		nativeBackend({ deliver: (bytes) => Array.from(bytes) });

		await writeAppDataFileAtomic({ path: "preferences.data", content });

		expect(await readAppDataFile("preferences.data")).toEqual(content);
	});

	it("reports a file that was never written as missing", async () => {
		nativeBackend();

		expect(await existsAppDataFile("preferences.data")).toBe(false);
		await expect(readAppDataFile("preferences.data")).rejects.toThrow(
			"No app data file at preferences.data",
		);
	});

	it("removes a file and tolerates removing it again", async () => {
		nativeBackend();
		await writeAppDataFileAtomic({ path: "preferences.data", content });

		await removeAppDataFile("preferences.data");
		await removeAppDataFile("preferences.data");

		expect(await existsAppDataFile("preferences.data")).toBe(false);
	});

	it("names the file by its identifier and sends the content as base64", async () => {
		nativeBackend();

		await writeAppDataFileAtomic({
			path: "preferences.data",
			content: new TextEncoder().encode("hello"),
		});

		expect(invokeMock).toHaveBeenCalledWith("write_app_data", {
			file: "preferences",
			content: "aGVsbG8=",
		});
	});
});

describe("in the browser", () => {
	it("keeps files in local storage without calling the native app", async () => {
		await writeAppDataFileAtomic({ path: "preferences.data", content });

		expect(await existsAppDataFile("preferences.data")).toBe(true);
		expect(await readAppDataFile("preferences.data")).toEqual(content);
		await removeAppDataFile("preferences.data");
		expect(await existsAppDataFile("preferences.data")).toBe(false);
		expect(invokeMock).not.toHaveBeenCalled();
	});
});
