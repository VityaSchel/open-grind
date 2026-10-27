// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { stopOtherPointerOutWhilePressed } from "./pressed-pointer";

const MOUSE = 1;
const FINGER = 2;

function pointer({ type, pointerId }: { type: string; pointerId: number }) {
	const event = new MouseEvent(type, { bubbles: true });
	Object.defineProperty(event, "pointerId", { value: pointerId });
	return event;
}

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
});

function mountGuarded() {
	const node = document.createElement("div");
	const inner = document.createElement("div");
	node.append(inner);
	document.body.append(node);
	const delivered: number[] = [];
	const record = (event: Event) => {
		delivered.push((event as PointerEvent).pointerId);
	};
	document.addEventListener("pointerout", record);
	cleanups.push(stopOtherPointerOutWhilePressed(node), () =>
		document.removeEventListener("pointerout", record),
	);
	return { inner, delivered };
}

describe("stopOtherPointerOutWhilePressed", () => {
	it("keeps another pointer's pointerout from the handlers above while a finger is down", () => {
		const { inner, delivered } = mountGuarded();

		inner.dispatchEvent(
			pointer({ type: "pointerdown", pointerId: FINGER }),
		);
		inner.dispatchEvent(pointer({ type: "pointerout", pointerId: MOUSE }));

		expect(delivered).toEqual([]);
	});

	it("lets the pressed pointer's own pointerout through", () => {
		const { inner, delivered } = mountGuarded();

		inner.dispatchEvent(
			pointer({ type: "pointerdown", pointerId: FINGER }),
		);
		inner.dispatchEvent(pointer({ type: "pointerout", pointerId: FINGER }));

		expect(delivered).toEqual([FINGER]);
	});

	it("lets every pointerout through once the finger lifts or is cancelled", () => {
		const { inner, delivered } = mountGuarded();

		inner.dispatchEvent(pointer({ type: "pointerout", pointerId: MOUSE }));
		inner.dispatchEvent(
			pointer({ type: "pointerdown", pointerId: FINGER }),
		);
		inner.dispatchEvent(pointer({ type: "pointerup", pointerId: FINGER }));
		inner.dispatchEvent(pointer({ type: "pointerout", pointerId: MOUSE }));
		inner.dispatchEvent(
			pointer({ type: "pointerdown", pointerId: FINGER }),
		);
		window.dispatchEvent(
			pointer({ type: "pointercancel", pointerId: FINGER }),
		);
		inner.dispatchEvent(pointer({ type: "pointerout", pointerId: MOUSE }));

		expect(delivered).toEqual([MOUSE, MOUSE, MOUSE]);
	});
});
