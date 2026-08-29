import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { noticeStorageBackend } = await import("./storage-notice");

beforeEach(() => {
	platformMock.mockReturnValue("linux");
});

afterEach(() => {
	vi.clearAllMocks();
});

async function noticeWith(backend: string) {
	callMethodMock.mockResolvedValue(backend);
	await noticeStorageBackend();
	expect(callMethodMock).toHaveBeenCalledWith("storage_backend");
}

describe("noticeStorageBackend", () => {
	it("keeps quiet when the platform keyring works", async () => {
		await noticeWith("keyring");
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it("warns a Linux user whose login lives in a plain file", async () => {
		await noticeWith("file");
		expect(toastWarningMock).toHaveBeenCalledOnce();
		expect(toastErrorMock).not.toHaveBeenCalled();
	});

	it("stays quiet about the file store off Linux, where it is the build's own choice", async () => {
		platformMock.mockReturnValue("macos");
		await noticeWith("file");
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it("raises a persistent error when nothing can store the login", async () => {
		await noticeWith("unavailable");
		expect(toastErrorMock).toHaveBeenCalledOnce();
		expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({
			duration: Number.POSITIVE_INFINITY,
		});
	});

	it("says nothing when the backend cannot be read", async () => {
		callMethodMock.mockRejectedValue(new Error("no bridge"));
		await noticeStorageBackend();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(toastWarningMock).not.toHaveBeenCalled();
	});
});
