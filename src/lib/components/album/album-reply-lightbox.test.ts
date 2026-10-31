import { fireEvent, screen } from "@testing-library/svelte";
import PhotoSwipeLightbox from "photoswipe/lightbox";
import { afterEach, describe, expect, it, vi } from "vitest";

import { announceSafeAreaChange } from "$lib/util/safe-area";
import { type AlbumSlide, openAlbumLightbox } from "./album-lightbox";

const controllers: AbortController[] = [];

afterEach(async () => {
	for (const controller of controllers.splice(0)) controller.abort();
	await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	vi.restoreAllMocks();
});

function slideById(contentId: number): AlbumSlide {
	return {
		contentId,
		contentType: "image/jpeg",
		url: `https://example.invalid/${contentId}.jpg`,
		coverUrl: null,
		thumbUrl: `https://example.invalid/${contentId}-thumb.jpg`,
		statusId: 1,
		processing: false,
		rejectionId: null,
		width: 100,
		height: 100,
	};
}

async function open({
	albumContentId,
	slides = [slideById(1), slideById(2)],
	onreply,
	onreact,
}: {
	albumContentId?: number;
	slides?: AlbumSlide[];
	onreact?: (slide: AlbumSlide) => void;
	onreply?: (reply: { slide: AlbumSlide; text: string }) => void;
} = {}) {
	const controller = new AbortController();
	controllers.push(controller);
	const opened = vi.spyOn(PhotoSwipeLightbox.prototype, "loadAndOpen");
	const onClosed = vi.fn();
	await openAlbumLightbox({
		albumId: 900,
		albumContentId,
		slides,
		signal: controller.signal,
		onClosed,
		onreply,
		onreact,
	});
	await vi.waitFor(() => expect(opened).toHaveBeenCalled());
	const lightbox = opened.mock.contexts.at(-1) as PhotoSwipeLightbox;
	await vi.waitFor(() => expect(lightbox.pswp?.opener.isOpen).toBe(true));
	return { lightbox, onClosed };
}

describe("album item reply viewer", () => {
	it("sends text for the referenced item after closing", async () => {
		const onreply = vi.fn();
		const { onClosed } = await open({ albumContentId: 2, onreply });
		const send = screen.getByRole("button", { name: "Send reply" });
		expect(send.hasAttribute("disabled")).toBe(true);
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to album item" }),
			{ target: { value: "   " } },
		);
		await fireEvent.click(send);
		expect(onreply).not.toHaveBeenCalled();
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to album item" }),
			{ target: { value: "  Nice photo!  " } },
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Send reply" }),
		);
		await vi.waitFor(() =>
			expect(onreply).toHaveBeenCalledWith({
				slide: slideById(2),
				text: "Nice photo!",
			}),
		);
		expect(onClosed).toHaveBeenCalledOnce();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("replies to the current slide after navigating", async () => {
		const onreply = vi.fn();
		const { lightbox } = await open({ onreply });
		const input = screen.getByRole("textbox", {
			name: "Reply to album item",
		});
		await fireEvent.input(input, {
			target: { value: "First slide draft" },
		});
		await fireEvent.keyDown(input, { key: "ArrowRight" });
		expect(lightbox.pswp?.currIndex).toBe(0);
		await fireEvent.click(screen.getByRole("button", { name: "Next" }));
		expect((input as HTMLTextAreaElement).value).toBe("");
		await vi.waitFor(() => expect(lightbox.pswp?.currIndex).toBe(1));
		await fireEvent.input(
			screen.getByRole("textbox", { name: "Reply to album item" }),
			{ target: { value: "  Nice photo!  " } },
		);
		await fireEvent.click(
			screen.getByRole("button", { name: "Send reply" }),
		);
		await vi.waitFor(() =>
			expect(onreply).toHaveBeenCalledWith({
				slide: slideById(2),
				text: "Nice photo!",
			}),
		);
	});

	it("does not offer replies without a reply callback", async () => {
		await open();
		expect(
			screen.queryByRole("textbox", { name: "Reply to album item" }),
		).toBeNull();
		expect(
			screen.queryByRole("button", {
				name: "React to album item with fire",
			}),
		).toBeNull();
	});

	it("disables replies for a video without plays remaining", async () => {
		const onreply = vi.fn();
		const onreact = vi.fn();
		const { lightbox } = await open({
			slides: [{ ...slideById(1), contentType: "video/mp4", url: "" }],
			onreply,
			onreact,
		});
		const input = screen.getByRole("textbox", {
			name: "Reply to album item",
		});
		expect(input.hasAttribute("disabled")).toBe(true);
		const button = screen.getByRole("button", {
			name: "React to album item with fire",
		});
		expect(button.hasAttribute("disabled")).toBe(true);
		await fireEvent.click(button);
		expect(onreact).not.toHaveBeenCalled();
		await fireEvent.input(input, { target: { value: "Not sent" } });
		const send = screen.getByRole("button", { name: "Send reply" });
		expect(send.hasAttribute("disabled")).toBe(true);
		await fireEvent.click(send);
		expect(onreply).not.toHaveBeenCalled();
		expect(lightbox.pswp?.opener.isOpen).toBe(true);
	});

	it("does not open another item when the referenced content was removed", async () => {
		await expect(open({ albumContentId: 99 })).rejects.toThrow(
			"This album item is no longer available.",
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

it("does not send when the viewer is dismissed", async () => {
	const onreply = vi.fn();
	await open({ onreply });
	await fireEvent.input(
		screen.getByRole("textbox", { name: "Reply to album item" }),
		{ target: { value: "Not sent" } },
	);
	await fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(onreply).not.toHaveBeenCalled();
});

it("closes the viewer on Escape from the reply field without sending", async () => {
	const onreply = vi.fn();
	await open({ onreply });
	const input = screen.getByRole("textbox", { name: "Reply to album item" });
	await fireEvent.input(input, { target: { value: "Not sent" } });
	input.focus();
	await fireEvent.keyDown(input, { key: "Escape", keyCode: 27 });
	await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(onreply).not.toHaveBeenCalled();
});

it("keeps Shift+Enter for newlines and submits a reply with Enter on desktop", async () => {
	const onreply = vi.fn();
	await open({ onreply });
	const input = screen.getByRole("textbox", { name: "Reply to album item" });
	expect(input.tagName).toBe("TEXTAREA");
	expect(input.getAttribute("placeholder")).toBe("Write a reply...");
	await fireEvent.input(input, {
		target: { value: "First line\nSecond line" },
	});
	expect(
		await fireEvent.keyDown(input, { key: "Enter", shiftKey: true }),
	).toBe(true);
	expect(onreply).not.toHaveBeenCalled();
	await fireEvent.keyDown(input, { key: "Enter" });
	await vi.waitFor(() =>
		expect(onreply).toHaveBeenCalledExactlyOnceWith({
			slide: slideById(1),
			text: "First line\nSecond line",
		}),
	);
});

it("does not send when the owning screen is destroyed", async () => {
	const onreply = vi.fn();
	await open({ onreply });
	await fireEvent.input(
		screen.getByRole("textbox", { name: "Reply to album item" }),
		{ target: { value: "Not sent" } },
	);
	controllers.at(-1)!.abort();
	await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	expect(onreply).not.toHaveBeenCalled();
});

it("switches the single album action between reaction and reply", async () => {
	const onreact = vi.fn();
	const onreply = vi.fn();
	const { lightbox } = await open({ onreact, onreply });
	const input = screen.getByRole("textbox", { name: "Reply to album item" });
	await fireEvent.click(
		screen.getByRole("button", { name: "React to album item with fire" }),
	);
	expect(onreact).toHaveBeenCalledExactlyOnceWith(slideById(1));
	expect(lightbox.pswp?.opener.isOpen).toBe(true);
	await fireEvent.input(input, { target: { value: "  Nice!  " } });
	expect(
		screen.queryByRole("button", { name: "React to album item with fire" }),
	).toBeNull();
	await fireEvent.input(input, { target: { value: "" } });
	expect(
		screen
			.getByRole("button", { name: "React to album item with fire" })
			.hasAttribute("disabled"),
	).toBe(true);
	await fireEvent.click(screen.getByRole("button", { name: "Next" }));
	await vi.waitFor(() => expect(lightbox.pswp?.currIndex).toBe(1));
	await fireEvent.input(input, { target: { value: "  Second photo  " } });
	await fireEvent.submit(input.closest("form")!);
	await vi.waitFor(() =>
		expect(onreply).toHaveBeenCalledExactlyOnceWith({
			slide: slideById(2),
			text: "Second photo",
		}),
	);
	expect(onreact).toHaveBeenCalledOnce();
});

describe("album item reactions", () => {
	it("reacts to the selected item and keeps the viewer open for navigation", async () => {
		const onreact = vi.fn();
		const { lightbox, onClosed } = await open({ onreact });
		await fireEvent.click(screen.getByRole("button", { name: "Next" }));
		await vi.waitFor(() => expect(lightbox.pswp?.currIndex).toBe(1));
		await fireEvent.click(
			screen.getByRole("button", {
				name: "React to album item with fire",
			}),
		);
		expect(onreact).toHaveBeenCalledExactlyOnceWith(slideById(2));
		expect(onClosed).not.toHaveBeenCalled();
		expect(lightbox.pswp?.opener.isOpen).toBe(true);
		const reaction = screen.getByRole("button", {
			name: "React to album item with fire",
		});
		reaction.focus();
		await fireEvent.keyDown(reaction, { key: "ArrowLeft", keyCode: 37 });
		await vi.waitFor(() => expect(lightbox.pswp?.currIndex).toBe(0));
	});
	it("opens the referenced item", async () => {
		const { lightbox } = await open({ albumContentId: 2 });
		expect(lightbox.pswp?.currIndex).toBe(1);
	});
});

it("updates safe-area layout once and preserves photo top and side padding", async () => {
	const { lightbox } = await open({ onreply: vi.fn() });
	const updateSize = vi.spyOn(lightbox.pswp!, "updateSize");
	announceSafeAreaChange();
	expect(updateSize).toHaveBeenCalledOnce();
	const style = document.documentElement.style;
	const previous = style.cssText;
	try {
		style.setProperty("--safe-area-top", "24px");
		style.setProperty("--safe-area-left", "12px");
		style.setProperty("--safe-area-right", "14px");
		style.setProperty("--safe-area-bottom", "20px");
		const padding = lightbox.options.paddingFn!({ x: 400, y: 800 }, {}, 0);
		expect(padding).toEqual({ top: 0, left: 0, right: 0, bottom: 20 });
	} finally {
		style.cssText = previous;
	}
});

it("cancels a submitted reply if the owner is destroyed during close", async () => {
	const onreply = vi.fn();
	const { onClosed } = await open({ onreply });
	onClosed.mockImplementation(() => controllers.at(-1)!.abort());
	const input = screen.getByRole("textbox", { name: "Reply to album item" });
	await fireEvent.input(input, { target: { value: "Not sent" } });
	await fireEvent.submit(input.closest("form")!);
	await vi.waitFor(() => expect(onClosed).toHaveBeenCalledOnce());
	expect(onreply).not.toHaveBeenCalled();
});

it("remembers reacted media IDs only until the album viewer closes", async () => {
	const onreact = vi.fn();
	const slides = [slideById(1), slideById(2), slideById(1)];
	const { lightbox } = await open({ onreact, slides });
	const reaction = () =>
		screen.getByRole("button", { name: "React to album item with fire" });
	await fireEvent.click(reaction());
	expect(reaction().hasAttribute("disabled")).toBe(true);
	expect(reaction().classList.contains("bg-primary")).toBe(true);
	expect(reaction().classList.contains("disabled:opacity-100")).toBe(true);
	await fireEvent.submit(reaction().closest("form")!);
	expect(onreact).toHaveBeenCalledOnce();
	lightbox.pswp!.goTo(1);
	await vi.waitFor(() =>
		expect(reaction().hasAttribute("disabled")).toBe(false),
	);
	lightbox.pswp!.goTo(2);
	await vi.waitFor(() =>
		expect(reaction().hasAttribute("disabled")).toBe(true),
	);
	await fireEvent.click(screen.getByRole("button", { name: "Close" }));
	await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	await open({ onreact, slides });
	expect(reaction().hasAttribute("disabled")).toBe(false);
	await fireEvent.click(reaction());
	expect(onreact).toHaveBeenCalledTimes(2);
});
