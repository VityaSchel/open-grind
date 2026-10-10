// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { collapsed } = vi.hoisted(() => ({ collapsed: { current: false } }));

vi.mock("$lib/util/breakpoints.svelte", () => ({ below: () => collapsed }));

import ConversationsSelectionBar from "./ConversationsSelectionBar.svelte";

function renderBar({
	count = 1,
	allPinned = false,
	allMuted = false,
}: { count?: number; allPinned?: boolean; allMuted?: boolean } = {}) {
	return render(ConversationsSelectionBar, {
		count,
		allPinned,
		allMuted,
		onPin: vi.fn(),
		onMute: vi.fn(),
		onDelete: vi.fn(),
		onClose: vi.fn(),
	});
}

const button = (name: string) => screen.queryByRole("button", { name });

describe("ConversationsSelectionBar", () => {
	afterEach(() => {
		cleanup();
		collapsed.current = false;
	});

	it("counts one selected conversation", () => {
		renderBar({ count: 1 });

		expect(screen.getByText("1 selected")).toBeTruthy();
	});

	it("counts several selected conversations", () => {
		renderBar({ count: 3 });

		expect(screen.getByText("3 selected")).toBeTruthy();
	});

	it("names the landmark and its controls", () => {
		renderBar();

		expect(
			screen.getByRole("navigation", { name: "Selection" }),
		).toBeTruthy();
		expect(button("Exit selection")).not.toBeNull();
		expect(button("Delete selected")).not.toBeNull();
	});

	it("flips Pin to Unpin once every selected conversation is pinned", async () => {
		const { rerender } = renderBar();
		expect(button("Pin selected")).not.toBeNull();

		await rerender({ allPinned: true });

		expect(button("Unpin selected")).not.toBeNull();
		expect(button("Pin selected")).toBeNull();
		expect(button("Mute selected")).not.toBeNull();
	});

	it("flips Mute to Unmute once every selected conversation is muted", async () => {
		const { rerender } = renderBar();
		expect(button("Mute selected")).not.toBeNull();

		await rerender({ allMuted: true });

		expect(button("Unmute selected")).not.toBeNull();
		expect(button("Mute selected")).toBeNull();
		expect(button("Pin selected")).not.toBeNull();
	});

	it("folds the actions into a named menu on a narrow screen", () => {
		collapsed.current = true;
		renderBar();

		expect(button("Selection actions")).not.toBeNull();
		expect(button("Pin selected")).toBeNull();
	});
});
