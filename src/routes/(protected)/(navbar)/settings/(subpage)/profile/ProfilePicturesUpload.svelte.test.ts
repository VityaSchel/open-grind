// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const profiles = vi.hoisted(() => ({ uploadProfilePhoto: vi.fn() }));
const picker = vi.hoisted(() => ({ pickMultipleMedia: vi.fn() }));
const sonner = vi.hoisted(() => ({ toast: { error: vi.fn() } }));
const demo = vi.hoisted(() => ({ demoEnabled: false }));

vi.mock("$lib/api/users/profiles", () => profiles);
vi.mock("$lib/platform/media-picker", () => picker);
vi.mock("svelte-sonner", () => sonner);
vi.mock("$lib/demo", () => demo);

import { ApiError } from "$lib/api/api-error";
import ProfilePicturesUpload from "./ProfilePicturesUpload.svelte";

function picks(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		source: "desktop",
		key: `pick-${index}`,
		mimeType: "image/jpeg",
		path: `/tmp/${index}.jpg`,
	}));
}

function hashes(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		mediaHash: `hash-${index}`,
	}));
}

const PENDING = '[data-slot="media-image-pending"]';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	demo.demoEnabled = false;
});

describe("profile pictures upload", () => {
	it("names every photo and its remove button by the slot it sits in", () => {
		const { getByRole } = render(ProfilePicturesUpload, {
			props: {
				medias: [{ mediaHash: "first" }, { mediaHash: "second" }],
			},
		});

		expect(
			getByRole("img", { name: "Profile photo in slot 1" }),
		).toBeTruthy();
		expect(
			getByRole("img", { name: "Profile photo in slot 2" }),
		).toBeTruthy();
		expect(
			getByRole("button", { name: "Remove profile photo in slot 2" }),
		).toBeTruthy();
	});

	it("shows a photo awaiting review as its thumbnail, named as awaiting review", () => {
		const { getByRole, container } = render(ProfilePicturesUpload, {
			props: { medias: [{ mediaHash: "first", pending: true }] },
		});

		expect(
			getByRole("img", {
				name: "Profile photo in slot 1, awaiting review",
			}),
		).toBeTruthy();
		expect(container.querySelector(PENDING)).toBeNull();
	});

	it("puts photos still uploading after the ones already there", async () => {
		picker.pickMultipleMedia.mockResolvedValue(picks(1));
		profiles.uploadProfilePhoto.mockReturnValue(new Promise(() => {}));
		const { getByRole, container } = render(ProfilePicturesUpload, {
			props: { medias: [{ mediaHash: "old" }] },
		});

		await fireEvent.click(getByRole("button", { name: "Add photos" }));

		await vi.waitFor(() =>
			expect(container.querySelector(PENDING)).not.toBeNull(),
		);
		const cells = [
			...container.querySelectorAll('[data-slot="media-slot-cell"]'),
		];
		expect(cells[0]?.querySelector(PENDING)).toBeNull();
		expect(cells.at(-1)?.querySelector(PENDING)).not.toBeNull();
	});

	it("opens one picker for a double tap", async () => {
		picker.pickMultipleMedia.mockReturnValue(new Promise(() => {}));
		const { getByRole } = render(ProfilePicturesUpload, {
			props: { medias: [] },
		});
		const add = getByRole("button", { name: "Add photos" });

		await fireEvent.click(add);
		await fireEvent.click(add);

		expect(picker.pickMultipleMedia).toHaveBeenCalledOnce();
	});

	it("offers no uploads in the demo", () => {
		demo.demoEnabled = true;
		const { queryByRole } = render(ProfilePicturesUpload, {
			props: { medias: [] },
		});

		expect(queryByRole("button", { name: "Add photos" })).toBeNull();
	});

	it("offers adding photos only while a slot is free", () => {
		const { queryByRole, unmount } = render(ProfilePicturesUpload, {
			props: { medias: hashes(5) },
		});
		expect(queryByRole("button", { name: "Add photos" })).toBeTruthy();
		unmount();

		const full = render(ProfilePicturesUpload, {
			props: { medias: hashes(6) },
		});
		expect(full.queryByRole("button", { name: "Add photos" })).toBeNull();
	});

	it("adds each uploaded photo after the ones already there", async () => {
		picker.pickMultipleMedia.mockResolvedValue(picks(2));
		profiles.uploadProfilePhoto
			.mockResolvedValueOnce({ mediaHash: "new-1", pending: true })
			.mockResolvedValueOnce({ mediaHash: "new-2", pending: true });
		const { getByRole } = render(ProfilePicturesUpload, {
			props: { medias: [{ mediaHash: "old" }] },
		});

		await fireEvent.click(getByRole("button", { name: "Add photos" }));

		await vi.waitFor(() =>
			expect(
				getByRole("img", {
					name: "Profile photo in slot 3, awaiting review",
				}),
			).toBeTruthy(),
		);
		expect(picker.pickMultipleMedia).toHaveBeenCalledWith("image");
		expect(profiles.uploadProfilePhoto).toHaveBeenCalledTimes(2);
	});

	it("leaves out picks past the free slots and says so", async () => {
		picker.pickMultipleMedia.mockResolvedValue(picks(3));
		profiles.uploadProfilePhoto.mockResolvedValue({
			mediaHash: "new",
			pending: true,
		});
		const { getByRole } = render(ProfilePicturesUpload, {
			props: { medias: hashes(4) },
		});

		await fireEvent.click(getByRole("button", { name: "Add photos" }));

		await vi.waitFor(() =>
			expect(profiles.uploadProfilePhoto).toHaveBeenCalledTimes(2),
		);
		expect(sonner.toast.error).toHaveBeenCalledWith(
			"1 left out, a profile holds up to 6 photos",
		);
	});

	it("names the daily limit and stops uploading the rest of the picks", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		picker.pickMultipleMedia.mockResolvedValue(picks(3));
		profiles.uploadProfilePhoto.mockRejectedValue(
			new ApiError({
				message: "HTTP 403",
				request: { method: "POST", path: "/v4/media/upload" },
				response: { status: 403, body: "" },
			}),
		);
		const { getByRole, container } = render(ProfilePicturesUpload, {
			props: { medias: [] },
		});

		await fireEvent.click(getByRole("button", { name: "Add photos" }));

		await vi.waitFor(() =>
			expect(sonner.toast.error).toHaveBeenCalledWith(
				"You've reached today's limit for new profile photos",
			),
		);
		await vi.waitFor(() =>
			expect(container.querySelector(PENDING)).toBeNull(),
		);
		expect(profiles.uploadProfilePhoto).toHaveBeenCalledOnce();
		expect(sonner.toast.error).toHaveBeenCalledOnce();
	});
});
