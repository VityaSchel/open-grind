// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { api, errorToast, guardUnsavedChanges, sonner } = vi.hoisted(() => ({
	api: {
		deleteAlbumContent: vi.fn<() => Promise<void>>(),
		getAlbumStorageLimits: () => new Promise<never>(() => {}),
	},
	errorToast: { showErrorToast: vi.fn() },
	guardUnsavedChanges: vi.fn<(unsaved: () => boolean) => void>(),
	sonner: { toast: { success: vi.fn(), error: vi.fn() } },
}));

vi.mock("#lib/api/messaging/albums.ts", () => api);
vi.mock("#lib/api/error-toast.ts", () => errorToast);
vi.mock("svelte-sonner", () => sonner);
vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn(), goto: vi.fn() }));
vi.mock("#lib/components/album/album-lightbox.ts", () => ({
	forgetAlbumSlides: vi.fn(),
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn(),
}));
vi.mock("#lib/components/shared/subpage-actions-context.svelte.ts", () => ({
	setSubpageActions: vi.fn(),
}));
vi.mock("#lib/components/shared/unsaved-changes-guard.svelte.ts", () => ({
	guardUnsavedChanges,
}));

import { ApiError } from "#lib/api/api-error.ts";
import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import type { AlbumContent } from "#lib/model/messaging/albums.ts";
import AlbumEditor from "./AlbumEditor.svelte";

function item({
	contentId,
	processing = false,
}: {
	contentId: number;
	processing?: boolean;
}): AlbumContent {
	return {
		contentId,
		contentType: processing ? "video/mp4" : "image/jpeg",
		coverUrl: `https://example.invalid/${contentId}/cover`,
		statusId: processing ? 3 : 1,
		thumbUrl: `https://example.invalid/${contentId}/thumb`,
		url: `https://example.invalid/${contentId}`,
		processing,
		rejectionId: null,
	};
}

function renderEditor(content: AlbumContent[]) {
	return render(AlbumEditor, {
		props: {
			album: {
				albumId: 900,
				albumName: "Studio",
				sharedCount: 0,
				updatedAt: "2026-09-01T10:00:00",
				content,
			},
			ourProfileId: 1,
		},
	});
}

async function removeAndSave(name: string): Promise<void> {
	await fireEvent.click(screen.getByRole("button", { name }));
	await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

beforeEach(() => runningOn("windows"));

afterEach(async () => {
	cleanup();
	resetPlatform();
	vi.clearAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album editor", () => {
	it("announces how many items are marked for removal in the active locale", async () => {
		const { container } = renderEditor([
			item({ contentId: 1 }),
			item({ contentId: 2 }),
		]);
		const status = container.querySelector<HTMLElement>(
			'[role="status"].sr-only',
		)!;
		expect(status.textContent.trim()).toBe("");

		await fireEvent.click(
			screen.getByRole("button", {
				name: "Remove album photo in slot 1",
			}),
		);
		expect(status.textContent.trim()).toBe("1 item marked for removal");
		await fireEvent.click(
			screen.getByRole("button", {
				name: "Remove album photo in slot 2",
			}),
		);
		expect(status.textContent.trim()).toBe("2 items marked for removal");

		await setLocale({ locale: "en-XA" });

		expect(status.textContent.trim()).toMatch(PSEUDO_MESSAGE);
	});

	it("guards its edits until a save starts", async () => {
		api.deleteAlbumContent.mockReturnValue(new Promise<never>(() => {}));
		renderEditor([item({ contentId: 1 }), item({ contentId: 2 })]);
		const unsaved = () => guardUnsavedChanges.mock.lastCall?.[0]();
		expect(unsaved()).toBe(false);

		await fireEvent.click(
			screen.getByRole("button", {
				name: "Remove album photo in slot 1",
			}),
		);
		expect(unsaved()).toBe(true);

		await fireEvent.click(
			screen.getByRole("button", { name: "Save changes" }),
		);
		expect(unsaved()).toBe(false);
	});

	it("confirms a saved change", async () => {
		api.deleteAlbumContent.mockResolvedValue(undefined);
		renderEditor([item({ contentId: 1 }), item({ contentId: 2 })]);

		await removeAndSave("Remove album photo in slot 1");

		await waitFor(() =>
			expect(sonner.toast.success).toHaveBeenCalledWith("Album updated"),
		);
	});

	it("explains that a processing video can't be removed yet", async () => {
		api.deleteAlbumContent.mockRejectedValue(
			new ApiError({
				message: "HTTP 400",
				request: { method: "DELETE", path: "/v1/albums/900/content/2" },
				response: { status: 400, body: "" },
			}),
		);
		renderEditor([
			item({ contentId: 1 }),
			item({ contentId: 2, processing: true }),
		]);

		await removeAndSave("Remove album video in slot 2");

		await waitFor(() =>
			expect(sonner.toast.error).toHaveBeenCalledWith(
				"This video is still processing. Try removing it again in a moment.",
			),
		);
	});

	it("reports a failed save in the active locale", async () => {
		const failure = new Error("offline");
		api.deleteAlbumContent.mockRejectedValue(failure);
		renderEditor([item({ contentId: 1 }), item({ contentId: 2 })]);

		await removeAndSave("Remove album photo in slot 1");
		await waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenCalledWith({
				label: "Couldn’t save album changes",
				error: failure,
			}),
		);

		const save = screen.getByRole("button", { name: "Save changes" });

		await setLocale({ locale: "en-XA" });
		await fireEvent.click(save);

		await waitFor(() =>
			expect(errorToast.showErrorToast).toHaveBeenLastCalledWith({
				label: expect.stringMatching(PSEUDO_MESSAGE),
				error: failure,
			}),
		);
	});
});
