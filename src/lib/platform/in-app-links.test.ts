import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isMacosPlatformMock } = vi.hoisted(() => ({
	isMacosPlatformMock: vi.fn(() => false),
}));
vi.mock("$lib/platform/os", () => ({ isMacosPlatform: isMacosPlatformMock }));

import { keepLinksInApp, staysInApp } from "$lib/platform/in-app-links";
import { isPlainClick } from "$lib/util/plain-click";

const MODIFIERS = ["shiftKey", "ctrlKey", "altKey", "metaKey"] as const;
const CLICK_TYPES = ["click", "auxclick"] as const;
const IN_APP_HREF = "/profile/100001";
const EXTERNAL_HREF = "https://example.org/";

const reachedTheApp: MouseEvent[] = [];
const releases: (() => void)[] = [];

function handleLikeTheApp(event: MouseEvent) {
	reachedTheApp.push(event);
	event.preventDefault();
}

function linkLabel(href: string | null): HTMLElement {
	const link = document.createElement("a");
	if (href !== null) link.setAttribute("href", href);
	const label = document.createElement("span");
	link.append(label);
	document.body.append(link);
	return label;
}

function press({
	target,
	type = "click",
	...init
}: MouseEventInit & {
	target: Element;
	type?: (typeof CLICK_TYPES)[number];
}): MouseEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		cancelable: true,
		composed: true,
		...init,
	});
	target.dispatchEvent(event);
	return event;
}

function soleArrival(): MouseEvent | undefined {
	expect(reachedTheApp).toHaveLength(1);
	return reachedTheApp[0];
}

beforeEach(() => {
	for (const type of CLICK_TYPES)
		document.addEventListener(type, handleLikeTheApp);
});

afterEach(() => {
	for (const release of releases.splice(0)) release();
	for (const type of CLICK_TYPES)
		document.removeEventListener(type, handleLikeTheApp);
	reachedTheApp.length = 0;
	document.body.replaceChildren();
	isMacosPlatformMock.mockReturnValue(false);
});

describe("keepLinksInApp", () => {
	it.each(MODIFIERS)(
		"hands the app a plain click in place of one holding %s",
		(modifier) => {
			releases.push(keepLinksInApp());
			const target = linkLabel(IN_APP_HREF);

			const pressed = press({
				target,
				[modifier]: true,
				clientX: 31,
				clientY: 47,
				detail: 1,
			});

			expect(pressed.defaultPrevented).toBe(true);
			const replayed = soleArrival();
			expect(replayed).not.toBe(pressed);
			expect(replayed?.type).toBe("click");
			expect(replayed !== undefined && isPlainClick(replayed)).toBe(true);
			expect(replayed?.target).toBe(target);
			expect({
				clientX: replayed?.clientX,
				clientY: replayed?.clientY,
				detail: replayed?.detail,
			}).toEqual({ clientX: 31, clientY: 47, detail: 1 });
		},
	);

	it.each(CLICK_TYPES)(
		"turns a middle-button %s into a primary click",
		(type) => {
			releases.push(keepLinksInApp());
			const target = linkLabel(IN_APP_HREF);

			const pressed = press({ target, type, button: 1 });

			expect(pressed.defaultPrevented).toBe(true);
			const replayed = soleArrival();
			expect(replayed).not.toBe(pressed);
			expect(replayed?.type).toBe("click");
			expect(replayed?.button).toBe(0);
		},
	);

	it("delivers a plain click once, untouched", () => {
		releases.push(keepLinksInApp());

		const pressed = press({ target: linkLabel(IN_APP_HREF) });

		expect(soleArrival()).toBe(pressed);
	});

	it("leaves a modified click on an external link to the system browser", () => {
		releases.push(keepLinksInApp());

		const pressed = press({
			target: linkLabel(EXTERNAL_HREF),
			shiftKey: true,
		});

		expect(soleArrival()).toBe(pressed);
	});

	it.each([
		"ogmedia://localhost/iaHR0cHM",
		"http://ogmedia.localhost/iaHR0cHM",
	])("keeps a modified click on the proxied photo %s in the app", (href) => {
		releases.push(keepLinksInApp());

		const pressed = press({ target: linkLabel(href), shiftKey: true });

		expect(pressed.defaultPrevented).toBe(true);
		expect(soleArrival()).not.toBe(pressed);
	});

	it("ignores a link that has nowhere to go", () => {
		releases.push(keepLinksInApp());

		const pressed = press({ target: linkLabel(null), shiftKey: true });

		expect(soleArrival()).toBe(pressed);
	});

	it("ignores a modified click outside any link", () => {
		releases.push(keepLinksInApp());
		const button = document.createElement("button");
		document.body.append(button);

		const pressed = press({ target: button, shiftKey: true });

		expect(soleArrival()).toBe(pressed);
	});

	it.each([2, 3, 4])("ignores mouse button %i", (button) => {
		releases.push(keepLinksInApp());

		const pressed = press({
			target: linkLabel(IN_APP_HREF),
			type: "auxclick",
			button,
		});

		expect(soleArrival()).toBe(pressed);
	});

	it.each([IN_APP_HREF, EXTERNAL_HREF])(
		"swallows the macOS secondary click on %s, leaving only the menu",
		(href) => {
			isMacosPlatformMock.mockReturnValue(true);
			releases.push(keepLinksInApp());

			const pressed = press({
				target: linkLabel(href),
				ctrlKey: true,
				detail: 1,
			});

			expect(pressed.defaultPrevented).toBe(true);
			expect(reachedTheApp).toEqual([]);
		},
	);

	it("follows a link activated from the keyboard on macOS with Control held", () => {
		isMacosPlatformMock.mockReturnValue(true);
		releases.push(keepLinksInApp());

		const pressed = press({
			target: linkLabel(IN_APP_HREF),
			ctrlKey: true,
			detail: 0,
		});

		const replayed = soleArrival();
		expect(replayed).not.toBe(pressed);
		expect(replayed?.ctrlKey).toBe(false);
	});

	it("still navigates on macOS for the modifiers that are not a secondary click", () => {
		isMacosPlatformMock.mockReturnValue(true);
		releases.push(keepLinksInApp());

		const pressed = press({
			target: linkLabel(IN_APP_HREF),
			metaKey: true,
		});

		expect(soleArrival()).not.toBe(pressed);
	});

	it.each(CLICK_TYPES)("stops taking over a %s once released", (type) => {
		const release = keepLinksInApp();
		release();

		const pressed = press({
			target: linkLabel(IN_APP_HREF),
			type,
			button: 1,
		});

		expect(soleArrival()).toBe(pressed);
	});
});

describe("staysInApp", () => {
	it.each([
		{ href: "tauri://localhost/profile/1", app: "tauri://localhost/" },
		{ href: "http://tauri.localhost/chat", app: "http://tauri.localhost/" },
		{ href: "http://localhost:1420/", app: "http://localhost:1420/chat" },
		{ href: "ogmedia://localhost/iaHR0cHM", app: "tauri://localhost/" },
		{
			href: "http://ogmedia.localhost/iaHR0cHM",
			app: "http://tauri.localhost/",
		},
	])("keeps $href inside an app served from $app", ({ href, app }) => {
		expect(staysInApp({ href, app: new URL(app) })).toBe(true);
	});

	it.each([
		{ href: "https://example.org/", app: "http://tauri.localhost/" },
		{ href: "https://tauri.localhost/", app: "http://tauri.localhost/" },
		{ href: "http://localhost:5173/", app: "http://localhost:1420/" },
		{ href: "mailto:someone@example.org", app: "tauri://localhost/" },
		{ href: "not a url", app: "tauri://localhost/" },
	])("lets $href leave an app served from $app", ({ href, app }) => {
		expect(staysInApp({ href, app: new URL(app) })).toBe(false);
	});
});
