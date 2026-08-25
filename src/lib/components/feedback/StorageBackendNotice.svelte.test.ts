// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StorageBackendNotice from "./StorageBackendNotice.svelte";

const { callMethodMock, platformMock, toastErrorMock, toastWarningMock } =
	vi.hoisted(() => ({
		callMethodMock: vi.fn(),
		platformMock: vi.fn(),
		toastErrorMock: vi.fn(),
		toastWarningMock: vi.fn(),
	}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("svelte-sonner", () => ({
	toast: { error: toastErrorMock, warning: toastWarningMock },
}));

beforeEach(() => {
	platformMock.mockReturnValue("linux");
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

async function renderWith(backend: string) {
	callMethodMock.mockResolvedValue(backend);
	render(StorageBackendNotice);
	await vi.waitFor(() => {
		expect(callMethodMock).toHaveBeenCalledWith("storage_backend");
	});
	await Promise.resolve();
}

describe("StorageBackendNotice", () => {
	it("keeps quiet when the platform keyring works", async () => {
		await renderWith("keyring");
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it("warns a Linux user whose login lives in a plain file", async () => {
		await renderWith("file");
		expect(toastWarningMock).toHaveBeenCalledOnce();
		expect(toastErrorMock).not.toHaveBeenCalled();
	});

	it("stays quiet about the file store off Linux, where it is the build's own choice", async () => {
		platformMock.mockReturnValue("macos");
		await renderWith("file");
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it("raises a persistent error when nothing can store the login", async () => {
		await renderWith("unavailable");
		expect(toastErrorMock).toHaveBeenCalledOnce();
		expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({
			duration: Number.POSITIVE_INFINITY,
		});
	});
});
