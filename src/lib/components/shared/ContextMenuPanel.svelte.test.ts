// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import ContextMenuPanel from "./ContextMenuPanel.svelte";

let itemSlot: HTMLElement | null = null;

const items = createRawSnippet(() => ({
	render: () =>
		'<div class="contents"><button role="menuitem">Reply</button><button role="menuitem">Copy</button></div>',
	setup: (target) => {
		itemSlot = target;
	},
}));

const reactItem = createRawSnippet(() => ({
	render: () =>
		'<button role="menuitem" aria-label="React with fire"><img alt="" /></button>',
}));

function renderPanel() {
	return render(ContextMenuPanel, {
		props: {
			label: "Message actions",
			leading: reactItem,
			children: items,
		},
	});
}

function menuItem(name: string): HTMLElement {
	return screen.getByRole("menuitem", { name });
}

async function settle(): Promise<void> {
	await tick();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
	cleanup();
	itemSlot = null;
});

describe("ContextMenuPanel", () => {
	it("walks an item that appears while the menu is open", async () => {
		renderPanel();
		const added = document.createElement("button");
		added.setAttribute("role", "menuitem");
		added.textContent = "Delete for me";
		itemSlot!.append(added);
		await settle();
		menuItem("Copy").focus();

		await fireEvent.keyDown(menuItem("Copy"), { key: "ArrowDown" });
		await settle();

		expect(document.activeElement).toBe(added);
		expect(added.getAttribute("tabindex")).toBe("0");
	});

	it("stops walking an item that leaves while the menu is open", async () => {
		renderPanel();
		menuItem("Reply").focus();
		menuItem("Copy").remove();
		await settle();

		await fireEvent.keyDown(menuItem("Reply"), { key: "ArrowDown" });
		await settle();

		expect(document.activeElement).toBe(menuItem("React with fire"));
	});

	it("matches typed text against an icon-only item's accessible name", async () => {
		renderPanel();
		menuItem("Copy").focus();

		await fireEvent.keyDown(menuItem("Copy"), { key: "r" });
		await fireEvent.keyDown(menuItem("Copy"), { key: "e" });
		await fireEvent.keyDown(menuItem("Copy"), { key: "a" });
		await settle();

		expect(document.activeElement).toBe(menuItem("React with fire"));
	});
});
