import { afterEach, describe, expect, it, vi } from "vitest";

import {
	closeScreenLanding,
	currentScreenRoot,
	ghostFixupFor,
	holdScreenLanding,
	openScreenLanding,
	registerGhostFixup,
	screenRoot,
} from "./screen-root";
import { snapshotScreen } from "./snapshot";

const detached: (() => void)[] = [];

function attach(root: HTMLElement) {
	const detach = screenRoot(root);
	if (detach) detached.push(detach);
	return detach;
}

afterEach(() => {
	for (const detach of detached.splice(0)) detach();
	document.body.innerHTML = "";
});

describe("screenRoot", () => {
	it("makes the newest attached root the current one, and the one before it again once that goes", () => {
		const column = document.createElement("div");
		const conversation = document.createElement("div");
		expect(currentScreenRoot()).toBeNull();

		attach(column);
		const detachConversation = attach(conversation);
		expect(currentScreenRoot()).toBe(conversation);

		detachConversation?.();
		expect(currentScreenRoot()).toBe(column);
	});

	it("tracks the scrolled elements of a root so its picture keeps their scroll", () => {
		const root = document.createElement("div");
		root.innerHTML = "<div><div></div></div>";
		document.body.append(root);
		attach(root);
		const scroller = root.firstElementChild as HTMLElement;
		scroller.scrollTop = 120;
		scroller.dispatchEvent(new Event("scroll"));

		const snapshot = snapshotScreen({ root, path: "/" });
		snapshot.restore();

		expect(snapshot.node.firstElementChild?.scrollTop).toBe(120);
	});
});

describe("ghost fixups", () => {
	it("keeps a fixup by path until the screen that registered it unregisters", () => {
		const fixup = vi.fn();
		const unregister = registerGhostFixup({ path: "/", fixup });
		expect(ghostFixupFor("/")).toBe(fixup);
		expect(ghostFixupFor("/right-now")).toBeUndefined();

		unregister();
		expect(ghostFixupFor("/")).toBeUndefined();
	});

	it("leaves a newer fixup for the same path in place", () => {
		const unregisterOld = registerGhostFixup({ path: "/", fixup: vi.fn() });
		const newer = vi.fn();
		const unregisterNewer = registerGhostFixup({ path: "/", fixup: newer });

		unregisterOld();
		expect(ghostFixupFor("/")).toBe(newer);
		unregisterNewer();
	});
});

describe("screen landing holds", () => {
	it("takes no hold while no landing is open", async () => {
		const landing = openScreenLanding();
		closeScreenLanding(landing);

		holdScreenLanding();

		await expect(landing.released()).resolves.toBeUndefined();
	});

	it("is released once every hold taken while it was open is released", async () => {
		const landing = openScreenLanding();
		const first = holdScreenLanding();
		const second = holdScreenLanding();
		closeScreenLanding(landing);
		const released = vi.fn();
		void landing.released().then(released);

		first();
		first();
		await Promise.resolve();
		expect(released).not.toHaveBeenCalled();

		second();
		await Promise.resolve();
		expect(released).toHaveBeenCalledOnce();
	});

	it("keeps holds for the newest landing only", async () => {
		const older = openScreenLanding();
		const newer = openScreenLanding();
		closeScreenLanding(older);

		const release = holdScreenLanding();
		closeScreenLanding(newer);

		await expect(older.released()).resolves.toBeUndefined();
		const released = vi.fn();
		void newer.released().then(released);
		await Promise.resolve();
		expect(released).not.toHaveBeenCalled();
		release();
		await Promise.resolve();
		expect(released).toHaveBeenCalledOnce();
	});
});
