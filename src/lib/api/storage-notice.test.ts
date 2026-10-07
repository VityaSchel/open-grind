import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

const {
	callMethodMock,
	platformMock,
	toastErrorMock,
	toastWarningMock,
	activeToastsMock,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	platformMock: vi.fn(),
	toastErrorMock: vi.fn(),
	toastWarningMock: vi.fn(),
	activeToastsMock: vi.fn(),
}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: platformMock }));
vi.mock("svelte-sonner", () => ({
	toast: {
		error: toastErrorMock,
		warning: toastWarningMock,
		getActiveToasts: activeToastsMock,
	},
}));

const { noticeStorageBackend } = await import("./storage-notice");

beforeEach(() => {
	platformMock.mockReturnValue("linux");
	activeToastsMock.mockReturnValue([]);
});

afterEach(async () => {
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

const notices = [
	{
		notice: "plain-file warning",
		backend: "file",
		toast: toastWarningMock,
		english:
			"No secret service found. Your sign-in is kept in a plain file only your user can read.",
		options: { id: "storage-backend" },
	},
	{
		notice: "persistent error",
		backend: "unavailable",
		toast: toastErrorMock,
		english:
			"This device can't keep you signed in. You'll be signed out when the app closes.",
		options: { id: "storage-backend", duration: Number.POSITIVE_INFINITY },
	},
];

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

	it("warns a Linux user whose sign-in lives in a plain file", async () => {
		await noticeWith("file");
		expect(toastWarningMock).toHaveBeenCalledOnce();
		expect(toastErrorMock).not.toHaveBeenCalled();
	});

	it("stays quiet about the file store off Linux, where it is the build's own choice", async () => {
		platformMock.mockReturnValue("macos");
		await noticeWith("file");
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it("raises a persistent error when nothing can store the sign-in", async () => {
		await noticeWith("unavailable");
		expect(toastErrorMock).toHaveBeenCalledOnce();
		expect(toastErrorMock.mock.calls[0]?.[1]).toMatchObject({
			duration: Number.POSITIVE_INFINITY,
		});
	});

	it("rewords the persistent error after a locale switch", async () => {
		await noticeWith("unavailable");
		const [title, options] = toastErrorMock.mock.calls[0] ?? [];
		activeToastsMock.mockReturnValue([{ ...options, title }]);

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() =>
			expect(toastErrorMock).toHaveBeenLastCalledWith(
				expect.stringMatching(PSEUDO_MESSAGE),
				options,
			),
		);
	});

	it("says nothing when the backend cannot be read", async () => {
		callMethodMock.mockRejectedValue(new Error("no bridge"));
		await noticeStorageBackend();
		expect(toastErrorMock).not.toHaveBeenCalled();
		expect(toastWarningMock).not.toHaveBeenCalled();
	});

	it.each(notices)(
		"words the $notice in English",
		async ({ backend, toast, english, options }) => {
			await noticeWith(backend);
			expect(toast).toHaveBeenCalledExactlyOnceWith(english, options);
		},
	);

	it.each(notices)(
		"words the $notice in the active locale",
		async ({ backend, toast, options }) => {
			await setLocale({ locale: "en-XA" });
			await noticeWith(backend);
			expect(toast).toHaveBeenCalledExactlyOnceWith(
				expect.stringMatching(PSEUDO_MESSAGE),
				options,
			);
		},
	);
});
