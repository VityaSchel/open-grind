import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPlatform, runningOn } from "#lib/test/platform.ts";
import { keyboardDragDismiss } from "./keyboard-drag-dismiss";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
}));

let resized: ResizeObserverCallback[];
let detachers: (() => void)[];

function scroller({ top = 62, height = 778 } = {}): HTMLElement {
	const element = document.createElement("div");
	element.append(document.createElement("p"));
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
		new DOMRect(0, top, 402, height),
	);
	document.body.append(element);
	return element;
}

function hitting(element: Element | null) {
	document.elementFromPoint = () => element;
}

function attach(element: HTMLElement) {
	const detach = keyboardDragDismiss(element);
	if (detach) detachers.push(detach);
	return detach;
}

function targets(): unknown[] {
	return invokeMock.mock.calls
		.filter(([command]) => command === "set_keyboard_drag_dismiss")
		.map(([, args]) => (args as { target: unknown }).target);
}

beforeEach(() => {
	resized = [];
	detachers = [];
	invokeMock.mockReset();
	invokeMock.mockResolvedValue(undefined);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: ResizeObserverCallback) {
				resized.push(callback);
			}
			observe() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	for (const detach of detachers) detach();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	resetPlatform();
});

describe("on ios", () => {
	beforeEach(() => {
		runningOn("ios");
	});

	it("aims the drag at the middle of the list", () => {
		const list = scroller();
		hitting(list.firstElementChild);

		attach(list);

		expect(targets()).toEqual([{ x: 201, y: 62 + 778 / 2 }]);
	});

	it("aims nowhere while something covers the middle of the list", () => {
		const list = scroller();
		const cover = document.createElement("div");
		document.body.append(cover);
		hitting(cover);

		attach(list);

		expect(targets()).toEqual([]);
	});

	it("aims again when the list changes size", () => {
		const list = scroller();
		hitting(list.firstElementChild);
		attach(list);
		vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
			new DOMRect(0, 62, 402, 484),
		);

		for (const callback of resized) callback([], {} as ResizeObserver);

		expect(targets()).toEqual([
			{ x: 201, y: 62 + 778 / 2 },
			{ x: 201, y: 62 + 484 / 2 },
		]);
	});

	it("aims again when a field gains focus after the screen settled", () => {
		const list = scroller();
		hitting(null);
		attach(list);
		hitting(list.firstElementChild);

		document.body.dispatchEvent(new FocusEvent("focusin"));

		expect(targets()).toEqual([{ x: 201, y: 62 + 778 / 2 }]);
	});

	it("sends the same aim once", () => {
		const list = scroller();
		hitting(list.firstElementChild);
		attach(list);

		for (const callback of resized) callback([], {} as ResizeObserver);
		document.body.dispatchEvent(new FocusEvent("focusin"));

		expect(targets()).toHaveLength(1);
	});

	it("stops aiming when the list goes away", () => {
		const list = scroller();
		hitting(list.firstElementChild);
		const detach = attach(list);

		detach?.();
		detachers = [];
		document.body.dispatchEvent(new FocusEvent("focusin"));

		expect(targets()).toEqual([{ x: 201, y: 62 + 778 / 2 }, null]);
	});
});

describe.each(["android", "linux", "macos", "windows"] as const)(
	"on %s",
	(platform) => {
		it("leaves the keyboard to the system", () => {
			runningOn(platform);
			const list = scroller();
			hitting(list.firstElementChild);

			expect(attach(list)).toBeUndefined();

			expect(invokeMock).not.toHaveBeenCalled();
		});
	},
);
