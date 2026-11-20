// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lightbox = vi.hoisted(() => ({
	loadAlbumSlides: vi.fn(),
	openAlbumLightbox: vi.fn(),
}));
const sonner = vi.hoisted(() => ({
	toast: { info: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("./album-lightbox", () => lightbox);
vi.mock("svelte-sonner", () => sonner);
vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { runningOn } from "#lib/test/platform.ts";
import { proxyMediaUrl } from "#lib/util/media.ts";
import { singleClick } from "../../../routes/(protected)/chat/[conversationId]/messages/message/single-click";
import AlbumPreview from "./AlbumPreview.svelte";

const BROKEN = '[data-slot="broken-media"]';
const PREVIEW = '[data-slot="album-preview"]';

function previewWithCover(
	coverUrl: string | null,
	{ chat = false } = {},
): Element {
	const { container } = render(AlbumPreview, {
		props: {
			albumId: 900,
			coverUrl,
			hasPhoto: true,
			hasVideo: false,
			attach: chat ? singleClick : undefined,
		},
	});
	const preview = container.querySelector(PREVIEW);
	if (preview === null) throw new Error("no album preview");
	return preview;
}

function renderPreview(label?: string): HTMLButtonElement {
	const { container } = render(AlbumPreview, {
		props: {
			albumId: 900,
			coverUrl: null,
			hasPhoto: true,
			hasVideo: false,
			label,
		},
	});
	const preview = container.querySelector<HTMLButtonElement>(PREVIEW);
	if (preview === null) throw new Error("no album preview");
	return preview;
}

function focusPreview({
	preview,
	from,
}: {
	preview: Element;
	from: "keyboard" | "pointer";
}): HTMLButtonElement {
	if (!(preview instanceof HTMLButtonElement))
		throw new Error("album preview is not a button");
	const matches = preview.matches.bind(preview);
	vi.spyOn(preview, "matches").mockImplementation((selector) =>
		selector === ":focus-visible" ? from === "keyboard" : matches(selector),
	);
	preview.focus();
	return preview;
}

async function failedToastLabel(preview: HTMLButtonElement): Promise<unknown> {
	const consoleError = vi
		.spyOn(console, "error")
		.mockImplementation(() => {});
	await fireEvent.click(preview);
	await vi.waitFor(() => expect(sonner.toast.error).toHaveBeenCalledOnce());
	await vi.waitFor(() =>
		expect(preview.getAttribute("aria-disabled")).toBe("false"),
	);
	expect(consoleError).toHaveBeenCalledOnce();
	return sonner.toast.error.mock.calls[0]?.[0];
}

beforeEach(() => {
	runningOn("windows");
});

afterEach(async () => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("album preview", () => {
	it("shows a plain cover without the broken image icon when there is no cover", () => {
		const preview = previewWithCover(null);

		expect(
			preview.querySelector('[data-slot="empty-media"]'),
		).not.toBeNull();
		expect(preview.querySelector(BROKEN)).toBeNull();
	});

	it("shows the broken image icon when the cover fails to load", async () => {
		const preview = previewWithCover("https://example.invalid/cover");
		const cover = preview.querySelector("img");
		if (cover === null) throw new Error("no cover image");

		await fireEvent.error(cover);

		expect(preview.querySelector(BROKEN)).not.toBeNull();
	});

	it("goes back to idle without a word when the album has nothing ready to show", async () => {
		let answer!: (slides: never[]) => void;
		lightbox.loadAlbumSlides.mockReturnValue(
			new Promise((resolve) => (answer = resolve)),
		);
		const { getByRole } = render(AlbumPreview, {
			props: {
				albumId: 900,
				coverUrl: null,
				hasPhoto: false,
				hasVideo: true,
			},
		});
		const button = getByRole("button", {
			name: "Open album",
		}) as HTMLButtonElement;

		await fireEvent.click(button);
		expect(button.getAttribute("aria-disabled")).toBe("true");
		answer([]);
		await vi.waitFor(() =>
			expect(button.getAttribute("aria-disabled")).toBe("false"),
		);

		expect(lightbox.loadAlbumSlides).toHaveBeenCalledWith(900);
		expect(lightbox.openAlbumLightbox).not.toHaveBeenCalled();
		expect(sonner.toast.info).not.toHaveBeenCalled();
		expect(sonner.toast.error).not.toHaveBeenCalled();
		expect(sonner.toast.message).not.toHaveBeenCalled();
	});

	it("says when the album fails to load", async () => {
		lightbox.loadAlbumSlides.mockRejectedValue(new Error("offline"));

		expect(await failedToastLabel(renderPreview())).toBe(
			"Couldn’t load album",
		);
		expect(lightbox.openAlbumLightbox).not.toHaveBeenCalled();
	});

	it("says when the loaded album fails to open", async () => {
		lightbox.loadAlbumSlides.mockResolvedValue([{ contentId: 1 }]);
		lightbox.openAlbumLightbox.mockRejectedValue(new Error("no viewer"));

		expect(await failedToastLabel(renderPreview())).toBe(
			"Couldn’t open album",
		);
	});

	it("words its failure toasts in the locale active when they show", async () => {
		lightbox.loadAlbumSlides.mockRejectedValue(new Error("offline"));
		const preview = renderPreview();

		await setLocale({ locale: "en-XA" });

		expect(await failedToastLabel(preview)).toMatch(PSEUDO_MESSAGE);
	});

	it("names itself in the active locale unless the caller names it", async () => {
		const named = renderPreview();
		const custom = renderPreview("Studio");
		expect(named.getAttribute("aria-label")).toBe("Open album");

		await setLocale({ locale: "en-XA" });

		expect(named.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(custom.getAttribute("aria-label")).toBe("Studio");
	});

	it("keeps focus on a preview pressed from the keyboard while it loads and after the album closes", async () => {
		const slides = [{ contentId: 1 }];
		lightbox.loadAlbumSlides.mockResolvedValue(slides);
		let closeAlbum = () => {};
		lightbox.openAlbumLightbox.mockImplementation(
			({ onClosed }: { onClosed: () => void }) => {
				closeAlbum = onClosed;
				return Promise.resolve();
			},
		);
		const preview = focusPreview({
			preview: renderPreview(),
			from: "keyboard",
		});

		await fireEvent.click(preview, { detail: 0 });
		await fireEvent.click(preview, { detail: 0 });

		expect(preview.disabled).toBe(false);
		expect(preview.getAttribute("aria-disabled")).toBe("true");
		expect(document.activeElement).toBe(preview);
		await vi.waitFor(() =>
			expect(lightbox.openAlbumLightbox).toHaveBeenCalledOnce(),
		);
		expect(lightbox.loadAlbumSlides).toHaveBeenCalledOnce();

		closeAlbum();
		await vi.waitFor(() =>
			expect(preview.getAttribute("aria-disabled")).toBe("false"),
		);
		expect(document.activeElement).toBe(preview);
	});

	it("lets go of focus when a pointer opens the album", async () => {
		lightbox.loadAlbumSlides.mockReturnValue(new Promise(() => {}));
		const preview = focusPreview({
			preview: renderPreview(),
			from: "pointer",
		});

		await fireEvent.click(preview, { detail: 1 });

		expect(document.activeElement).not.toBe(preview);
	});

	it("lets go of focus when a pointer opens an album in chat once the double click window passes", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			lightbox.loadAlbumSlides.mockReturnValue(new Promise(() => {}));
			const preview = focusPreview({
				preview: previewWithCover(null, { chat: true }),
				from: "pointer",
			});

			await fireEvent.pointerDown(preview);
			await fireEvent.click(preview, { detail: 1 });
			expect(document.activeElement).toBe(preview);
			await vi.advanceTimersByTimeAsync(300);

			expect(lightbox.loadAlbumSlides).toHaveBeenCalledExactlyOnceWith(
				900,
			);
			expect(document.activeElement).not.toBe(preview);
		} finally {
			vi.useRealTimers();
		}
	});

	it("keeps focus on an album in chat pressed from the keyboard", async () => {
		lightbox.loadAlbumSlides.mockReturnValue(new Promise(() => {}));
		const preview = focusPreview({
			preview: previewWithCover(null, { chat: true }),
			from: "keyboard",
		});

		await fireEvent.click(preview, { detail: 0 });

		expect(lightbox.loadAlbumSlides).toHaveBeenCalledExactlyOnceWith(900);
		expect(document.activeElement).toBe(preview);
	});
});

describe("album preview on Google Play", () => {
	afterEach(() => vi.unstubAllEnvs());

	function renderOnPlay({ ourAlbum }: { ourAlbum: boolean }) {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		return render(AlbumPreview, {
			props: {
				albumId: 900,
				coverUrl: "https://example.invalid/cover",
				hasPhoto: true,
				hasVideo: false,
				ourAlbum,
			},
		});
	}

	it("covers someone else's album and offers only the mature content setting", () => {
		const { getByRole, queryByRole } = renderOnPlay({ ourAlbum: false });

		expect(queryByRole("button", { name: "Open album" })).toBeNull();
		const album = getByRole("group", { name: "Open album" });
		expect(
			album.contains(getByRole("link", { name: "Show mature content" })),
		).toBe(true);
		expect(album.querySelector("img")?.getAttribute("src")).toBe(
			proxyMediaUrl("https://example.invalid/cover"),
		);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
	});

	it("opens our own album", async () => {
		lightbox.loadAlbumSlides.mockReturnValue(new Promise(() => {}));
		const { getByRole } = renderOnPlay({ ourAlbum: true });

		await fireEvent.click(getByRole("button", { name: "Open album" }));

		expect(lightbox.loadAlbumSlides).toHaveBeenCalledWith(900);
	});
});

describe("album preview cover renewal", () => {
	const OLD =
		"https://d3.cloudfront.net/albums/c.jpg?Expires=1700000900&Signature=OLD&Key-Pair-Id=K";
	const RENEWED =
		"https://d3.cloudfront.net/albums/c.jpg?Expires=1700004500&Signature=NEW&Key-Pair-Id=K";

	function renderCover(coverUrl: string) {
		const { container, rerender } = render(AlbumPreview, {
			props: { albumId: 900, coverUrl, hasPhoto: true, hasVideo: false },
		});
		const image = () => {
			const img = container.querySelector("img");
			if (img === null) throw new Error("no cover image");
			return img;
		};
		return { image, renew: (next: string) => rerender({ coverUrl: next }) };
	}

	it("keeps a loaded cover on its url when only the signature is renewed", async () => {
		const cover = renderCover(OLD);
		Object.defineProperty(cover.image(), "naturalWidth", {
			get: () => 300,
		});
		await fireEvent.load(cover.image());

		await cover.renew(RENEWED);

		expect(cover.image().getAttribute("src")).toBe(proxyMediaUrl(OLD));
	});

	it("loads the renewed url for a cover that failed", async () => {
		const cover = renderCover(OLD);
		await fireEvent.error(cover.image());

		await cover.renew(RENEWED);

		expect(cover.image().getAttribute("src")).toBe(proxyMediaUrl(RENEWED));
	});
});

it("cancels a pending album open on a second press and double click", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	try {
		const button = previewWithCover(null, { chat: true });
		await fireEvent.click(button, { detail: 1 });
		await vi.advanceTimersByTimeAsync(100);
		await fireEvent.pointerDown(button);
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
		await fireEvent.click(button, { detail: 1 });
		await fireEvent.click(button, { detail: 1 });
		await fireEvent.doubleClick(button);
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it("cancels a pending album open when removed", async () => {
	vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
	try {
		const button = previewWithCover(null, { chat: true });
		await fireEvent.click(button, { detail: 1 });
		cleanup();
		await vi.advanceTimersByTimeAsync(300);
		expect(lightbox.loadAlbumSlides).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

it("opens the album editor preview immediately on a pointer click", async () => {
	lightbox.loadAlbumSlides.mockResolvedValue([]);
	const button = previewWithCover(null);
	await fireEvent.click(button, { detail: 1 });
	expect(lightbox.loadAlbumSlides).toHaveBeenCalledExactlyOnceWith(900);
});
