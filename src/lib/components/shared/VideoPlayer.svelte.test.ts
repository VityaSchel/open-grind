// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/svelte";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import VideoPlayer from "./VideoPlayer.svelte";

const CONTROLS = "[data-pswp-interactive]";
const SRC = "ogmedia://media/a.mp4";

/** jsdom has no Web Animations API, so Svelte's outro would never finish. */
beforeAll(() => {
	Element.prototype.animate = () => {
		const animation = {
			currentTime: 0,
			playbackRate: 1,
			startTime: 0,
			playState: "finished",
			effect: null,
			onfinish: null as (() => void) | null,
			pause: () => {},
			play: () => {},
			cancel: () => {},
			finish: () => animation.onfinish?.(),
		};
		queueMicrotask(() => animation.onfinish?.());
		return animation as unknown as Animation;
	};
});

function player() {
	const { container } = render(VideoPlayer, {
		props: { src: SRC, poster: null },
	});
	const surface = container.querySelector<HTMLElement>("div.relative")!;
	const video = container.querySelector<HTMLVideoElement>("video")!;
	const controls = () => container.querySelector<HTMLElement>(CONTROLS);
	return { container, surface, video, controls };
}

/** jsdom ships no `PointerEvent`, and a bare `Event` carries no `pointerType`. */
function pointer(
	target: HTMLElement,
	type: string,
	pointerType: string,
	bubbles = true,
) {
	const event = new MouseEvent(type, { bubbles, cancelable: true });
	Object.defineProperty(event, "pointerType", { value: pointerType });
	return fireEvent(target, event);
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("VideoPlayer", () => {
	afterEach(cleanup);

	it("opens with the controls up", () => {
		expect(player().controls()).not.toBeNull();
	});

	it("keeps the controls up while a mouse moves onto them", async () => {
		const { video, controls } = player();

		await fireEvent.mouseOut(video, { relatedTarget: controls() });
		await pointer(video, "pointerout", "mouse");
		await settled();

		expect(controls()).not.toBeNull();
	});

	it("drops the controls once the mouse leaves the player", async () => {
		const { surface, controls } = player();

		await pointer(surface, "pointerleave", "mouse", false);
		await settled();
		expect(controls()).toBeNull();

		await pointer(surface, "pointerenter", "mouse", false);
		expect(controls()).not.toBeNull();
	});

	it("leaves the controls alone when a touch pointer ends", async () => {
		const { surface, controls } = player();

		await pointer(surface, "pointerleave", "touch", false);
		await settled();

		expect(controls()).not.toBeNull();
	});

	it("toggles the controls on a tap, and not on a click", async () => {
		const { video, controls } = player();

		await pointer(video, "pointerdown", "touch");
		await settled();
		expect(controls()).toBeNull();

		await pointer(video, "pointerdown", "touch");
		expect(controls()).not.toBeNull();

		await pointer(video, "pointerdown", "mouse");
		await settled();
		expect(controls()).not.toBeNull();
	});

	it("holds the controls for keyboard focus, and releases them with it", async () => {
		const { surface, controls } = player();
		const seek = controls()!.querySelector<HTMLElement>('[role="slider"]')!;

		seek.focus();
		await pointer(surface, "pointerleave", "mouse", false);
		await settled();
		expect(controls()).not.toBeNull();

		seek.blur();
		await settled();
		expect(controls()).toBeNull();
	});

	it("keeps the controls mounted while focus moves between them", async () => {
		const { controls } = player();
		const buttons = [
			...controls()!.querySelectorAll<HTMLElement>("button"),
		];

		buttons.at(0)?.focus();
		buttons.at(-1)?.focus();
		await settled();

		expect(controls()).not.toBeNull();
		expect(document.activeElement).toBe(buttons.at(-1));
	});
});
