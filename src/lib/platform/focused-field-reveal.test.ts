import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

import { runningOn } from "#lib/test/platform.ts";
import type { NativeInsets } from "./native-insets";
import {
	androidBridge,
	FALLBACK_INSETS,
	IOS_INSETS,
	IOS_KEYBOARD_SHOWN,
	KEYBOARD_HIDDEN,
	KEYBOARD_SHOWN,
	loadNativeInsets,
	resetNativeInsets,
	resizeViewport,
} from "./native-insets-test-helpers";

const topChromeClearance = vi.hoisted(() => vi.fn(() => 0));

vi.mock("#lib/util/screen-chrome.svelte.ts", () => ({
	remeasureScreenChrome: vi.fn(),
	topChromeClearance,
}));

beforeEach(() => {
	topChromeClearance.mockReturnValue(0);
});

afterEach(resetNativeInsets);

describe("revealing the focused field under the keyboard", () => {
	const SCREEN_HEIGHT = 874;
	const KEYBOARD_HEIGHT = 328;
	const ABOVE_KEYBOARD = SCREEN_HEIGHT - KEYBOARD_HEIGHT;
	const SAVE_BAR_HEIGHT = 60;

	let field: HTMLTextAreaElement;
	let scrollIntoView: Mock<HTMLElement["scrollIntoView"]>;
	let scrollBy: Mock<(options: ScrollToOptions) => void>;

	function focusField(
		element: HTMLElement,
		{
			bottom,
			inside = document.body,
			height = 40,
		}: { bottom: number; inside?: HTMLElement; height?: number },
	) {
		inside.append(element);
		element.focus();
		vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
			top: bottom - height,
			bottom,
		} as DOMRect);
		element.scrollIntoView = scrollIntoView;
	}

	function scrollContainer({ top, height }: { top: number; height: number }) {
		const container = document.createElement("div");
		container.style.overflowY = "auto";
		let clientHeight = height;
		Object.defineProperty(container, "clientHeight", {
			get: () => clientHeight,
		});
		vi.spyOn(container, "getBoundingClientRect").mockImplementation(
			() => ({ top, bottom: top + clientHeight }) as DOMRect,
		);
		Object.assign(container, { scrollBy });
		document.body.append(container);
		return {
			container,
			shrinkTo: (next: number) => {
				clientHeight = next;
			},
		};
	}

	function bottomChrome({
		top,
		height,
		inside,
	}: {
		top: number;
		height: number;
		inside: HTMLElement;
	}) {
		const chrome = document.createElement("div");
		chrome.dataset.screenChrome = "bottom";
		vi.spyOn(chrome, "getBoundingClientRect").mockReturnValue({
			top,
			bottom: top + height,
			height,
		} as DOMRect);
		inside.append(chrome);
		return chrome;
	}

	function openKeyboard(insets: NativeInsets = IOS_KEYBOARD_SHOWN) {
		window.__iosInsets = insets;
		window.__reapplyInsets(insets);
		resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
	}

	beforeEach(() => {
		vi.useFakeTimers({
			toFake: [
				"setTimeout",
				"clearTimeout",
				"requestAnimationFrame",
				"cancelAnimationFrame",
				"performance",
			],
		});
		vi.stubGlobal("innerHeight", SCREEN_HEIGHT);
		scrollIntoView = vi.fn();
		scrollBy = vi.fn();
		field = document.createElement("textarea");
	});

	afterEach(() => {
		document.body.replaceChildren();
	});

	describe("on ios", () => {
		beforeEach(async () => {
			runningOn("ios");
			window.__iosInsets = IOS_INSETS;
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
		});

		it("scrolls a field the keyboard covers into view a frame after the keyboard opens", () => {
			focusField(field, { bottom: 700 });

			openKeyboard();
			expect(scrollIntoView).not.toHaveBeenCalled();

			vi.advanceTimersToNextFrame();
			expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
				block: "nearest",
			});
		});

		it("reveals the field when the keyboard flip lands without a resize", () => {
			focusField(field, { bottom: 700 });
			vi.stubGlobal("innerHeight", SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets(IOS_KEYBOARD_SHOWN);
			vi.advanceTimersByTime(150);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).toHaveBeenCalledOnce();
		});

		it("reveals the field again on each resize while the keyboard stays open", () => {
			focusField(field, { bottom: 500 });
			openKeyboard();
			vi.advanceTimersToNextFrame();
			expect(scrollIntoView).not.toHaveBeenCalled();

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 52);
			vi.advanceTimersToNextFrame();
			expect(scrollIntoView).toHaveBeenCalledOnce();

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 80);
			vi.advanceTimersToNextFrame();
			expect(scrollIntoView).toHaveBeenCalledTimes(2);
		});

		it("scrolls once for several resizes in one frame", () => {
			focusField(field, { bottom: 700 });
			openKeyboard();

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 20);
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 40);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).toHaveBeenCalledOnce();
		});

		it("leaves a field above the keyboard where it is", () => {
			focusField(field, { bottom: SCREEN_HEIGHT - KEYBOARD_HEIGHT });

			openKeyboard();
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("scrolls a field its scroll container clips although the screen still shows it", () => {
			const { container } = scrollContainer({ top: 62, height: 400 });
			focusField(field, { bottom: 500, inside: container });

			openKeyboard();
			vi.advanceTimersToNextFrame();

			expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 38 });
			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		describe("under bottom chrome in its scroll container", () => {
			const SAVE_BAR_TOP = ABOVE_KEYBOARD - SAVE_BAR_HEIGHT;

			function formAboveKeyboard() {
				return scrollContainer({ top: 62, height: ABOVE_KEYBOARD - 62 })
					.container;
			}

			it("scrolls a field the bottom chrome covers up to its top", () => {
				const form = formAboveKeyboard();
				focusField(field, { bottom: ABOVE_KEYBOARD, inside: form });
				bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: SAVE_BAR_HEIGHT,
				});
			});

			it("keeps the top of a field taller than the space above the bottom chrome below the top chrome", () => {
				const HEADER_BOTTOM = 138;
				topChromeClearance.mockReturnValue(HEADER_BOTTOM);
				const form = formAboveKeyboard();
				focusField(field, {
					bottom: ABOVE_KEYBOARD,
					inside: form,
					height: 400,
				});
				bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: ABOVE_KEYBOARD - 400 - HEADER_BOTTOM,
				});
			});

			it("leaves a field above the bottom chrome where it is", () => {
				const form = formAboveKeyboard();
				focusField(field, { bottom: SAVE_BAR_TOP, inside: form });
				bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
				expect(scrollIntoView).not.toHaveBeenCalled();
			});

			it("reveals the field once bottom chrome finishes appearing over it", () => {
				const form = formAboveKeyboard();
				focusField(field, { bottom: ABOVE_KEYBOARD, inside: form });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				}).dispatchEvent(new CustomEvent("introend"));
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: SAVE_BAR_HEIGHT,
				});
			});

			it("reveals a field the bottom chrome covers once focus moves to it", () => {
				const form = formAboveKeyboard();
				focusField(field, { bottom: 300, inside: form });
				const lowerRow = document.createElement("div");
				form.append(lowerRow);
				bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				focusField(document.createElement("input"), {
					bottom: SAVE_BAR_TOP + 40,
					inside: lowerRow,
				});
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 40 });
			});

			it("ignores bottom chrome that holds the field", () => {
				const form = formAboveKeyboard();
				const composer = bottomChrome({
					top: SAVE_BAR_TOP,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});
				focusField(field, {
					bottom: ABOVE_KEYBOARD - 8,
					inside: composer,
				});

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
			});

			it("ignores bottom chrome that comes before the field", () => {
				const form = formAboveKeyboard();
				bottomChrome({
					top: 100,
					height: SAVE_BAR_HEIGHT,
					inside: form,
				});
				focusField(field, { bottom: 300, inside: form });

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
			});

			it("ignores bottom chrome that takes no space", () => {
				const form = formAboveKeyboard();
				focusField(field, { bottom: 300, inside: form });
				bottomChrome({ top: 0, height: 0, inside: form });

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
			});
		});

		describe("while its scroll container settles", () => {
			let resized: ResizeObserverCallback[];
			let disconnected: number;

			function reportResize() {
				for (const callback of resized)
					callback([], {} as ResizeObserver);
			}

			beforeEach(() => {
				resized = [];
				disconnected = 0;
				vi.stubGlobal(
					"ResizeObserver",
					class {
						constructor(callback: ResizeObserverCallback) {
							resized.push(callback);
						}
						observe() {}
						disconnect() {
							disconnected += 1;
						}
					},
				);
			});

			it("scrolls the field once its scroll container shrinks under it", () => {
				const { container, shrinkTo } = scrollContainer({
					top: 62,
					height: SCREEN_HEIGHT - 62,
				});
				focusField(field, { bottom: 500, inside: container });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				shrinkTo(400);
				reportResize();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 38 });
			});

			it("stops watching the scroll container once the keyboard closes", () => {
				const { container } = scrollContainer({
					top: 62,
					height: SCREEN_HEIGHT - 62,
				});
				focusField(field, { bottom: 500, inside: container });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(disconnected).toBe(0);

				window.__iosInsets = IOS_INSETS;
				window.__reapplyInsets(IOS_INSETS);
				resizeViewport(SCREEN_HEIGHT);

				expect(disconnected).toBe(1);
			});
		});

		it("never scrolls while the keyboard is closed", () => {
			focusField(field, { bottom: 700 });

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("stops revealing once the keyboard closes", () => {
			focusField(field, { bottom: 500 });
			openKeyboard();
			vi.advanceTimersToNextFrame();

			window.__iosInsets = IOS_INSETS;
			window.__reapplyInsets(IOS_INSETS);
			resizeViewport(SCREEN_HEIGHT);
			resizeViewport(400);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("leaves a focused control that takes no typing alone", () => {
			focusField(document.createElement("button"), { bottom: 700 });

			openKeyboard();
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});
	});

	it("never scrolls a field bottom chrome covers on android, where the WebView reveals it", async () => {
		runningOn("android");
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		const { installNativeInsets } = await loadNativeInsets();
		installNativeInsets();
		const { container } = scrollContainer({
			top: 24,
			height: ABOVE_KEYBOARD - 24,
		});
		focusField(field, { bottom: ABOVE_KEYBOARD, inside: container });
		window.__reapplyInsets(KEYBOARD_SHOWN);
		resizeViewport(ABOVE_KEYBOARD);
		vi.advanceTimersToNextFrame();

		bottomChrome({
			top: ABOVE_KEYBOARD - SAVE_BAR_HEIGHT,
			height: SAVE_BAR_HEIGHT,
			inside: container,
		}).dispatchEvent(new CustomEvent("introend"));
		field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
		vi.advanceTimersToNextFrame();

		expect(scrollBy).not.toHaveBeenCalled();
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it("never scrolls the focused field on android, where the WebView reveals it", async () => {
		runningOn("android");
		window.__AndroidInsets = androidBridge(KEYBOARD_HIDDEN);
		const { installNativeInsets } = await loadNativeInsets();
		installNativeInsets();
		focusField(field, { bottom: 700 });

		window.__reapplyInsets(KEYBOARD_SHOWN);
		resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
		vi.advanceTimersToNextFrame();

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it.each(["linux", "macos", "windows"] as const)(
		"never scrolls the focused field on %s",
		async (platform) => {
			runningOn(platform);
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets({ fallback: FALLBACK_INSETS });
			focusField(field, { bottom: 700 });

			window.__reapplyInsets({
				...FALLBACK_INSETS,
				bottom: 0,
				ime: true,
			});
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		},
	);
});
