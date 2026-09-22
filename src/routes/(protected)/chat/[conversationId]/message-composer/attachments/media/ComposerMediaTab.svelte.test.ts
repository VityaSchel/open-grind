// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const drawer = vi.hoisted(() => ({ getDrawerMedia: vi.fn() }));
const chatMedia = vi.hoisted(() => ({ addMediaToDrawer: vi.fn() }));
const picker = vi.hoisted(() => ({ pickMultipleMedia: vi.fn() }));

vi.mock("$lib/api/messaging/drawer", () => drawer);
vi.mock("$lib/api/messaging/chat-media", () => chatMedia);
vi.mock("$lib/platform/media-picker", () => picker);
vi.mock("svelte-sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("../../message-composer-context.svelte", () => ({
	getMessageComposerContext: () => () => ({}),
}));
vi.mock("../../../conversation-state.svelte", () => ({
	getConversationState: () => () => ({ conversationId: "100001:100002" }),
}));

import ComposerMediaTab from "./ComposerMediaTab.svelte";

const PENDING = '[data-slot="media-image-pending"]';
const SKELETON = '[data-slot="skeleton"]';

function renderTab() {
	return render(ComposerMediaTab, {
		props: {
			onClose: () => {},
			onSelectionChange: () => {},
			expiring: false,
		},
	});
}

afterEach(() => cleanup());

describe("composer media tab", () => {
	it("shows the loading grid as pending media images", async () => {
		drawer.getDrawerMedia.mockReturnValue(new Promise(() => {}));
		const { container } = renderTab();
		await tick();

		expect(container.querySelectorAll(PENDING)).toHaveLength(12);
		expect(container.querySelectorAll(SKELETON)).toHaveLength(0);
	});

	it("shows an upload in flight as a pending media image", async () => {
		drawer.getDrawerMedia.mockResolvedValue([]);
		picker.pickMultipleMedia.mockResolvedValue([
			{ key: "picked", mimeType: "image/jpeg", path: "/picked.jpg" },
		]);
		chatMedia.addMediaToDrawer.mockReturnValue(new Promise(() => {}));
		const { getByRole, container } = renderTab();
		await tick();
		await tick();

		await fireEvent.click(getByRole("button", { name: "Add photo" }));
		await vi.waitFor(() =>
			expect(chatMedia.addMediaToDrawer).toHaveBeenCalledOnce(),
		);
		await tick();

		expect(container.querySelectorAll(PENDING)).toHaveLength(1);
		expect(container.querySelectorAll(SKELETON)).toHaveLength(0);
	});
});
