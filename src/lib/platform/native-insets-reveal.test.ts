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
	KEYBOARD_HIDDEN,
	KEYBOARD_SHOWN,
	loadNativeInsets,
	resetNativeInsets,
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
	const IOS_KEYBOARD_SHOWN: NativeInsets = {
		...IOS_INSETS,
		bottom: 0,
		ime: true,
	};

	let field: HTMLTextAreaElement;
	let scrollIntoView: Mock<HTMLElement["scrollIntoView"]>;
	let scrollBy: Mock<(options: ScrollToOptions) => void>;

	function focusFieldWithBottomAt(
		bottom: number,
		element: HTMLElement,
		{
			inside = document.body,
			height = 40,
		}: { inside?: HTMLElement; height?: number } = {},
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

	function bottomChrome(
		{ top, height }: { top: number; height: number },
		{ inside }: { inside: HTMLElement },
	) {
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

	function resizeViewport(height: number) {
		vi.stubGlobal("innerHeight", height);
		window.dispatchEvent(new Event("resize"));
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
		beforeEach(() => {
			runningOn("ios");
			window.__iosInsets = IOS_INSETS;
		});

		it("scrolls a field the keyboard covers into view a frame after the keyboard opens", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(700, field);

			openKeyboard();
			expect(scrollIntoView).not.toHaveBeenCalled();

			vi.advanceTimersToNextFrame();
			expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
				block: "nearest",
			});
		});

		it("reveals the field when the keyboard flip lands without a resize", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(700, field);
			vi.stubGlobal("innerHeight", SCREEN_HEIGHT - KEYBOARD_HEIGHT);

			window.__reapplyInsets(IOS_KEYBOARD_SHOWN);
			vi.advanceTimersByTime(150);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).toHaveBeenCalledOnce();
		});

		it("reveals the field again on each resize while the keyboard stays open", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(500, field);
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

		it("scrolls once for several resizes in one frame", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(700, field);
			openKeyboard();

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 20);
			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT - 40);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).toHaveBeenCalledOnce();
		});

		it("leaves a field above the keyboard where it is", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(SCREEN_HEIGHT - KEYBOARD_HEIGHT, field);

			openKeyboard();
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("scrolls a field its scroll container clips although the screen still shows it", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			const { container } = scrollContainer({ top: 62, height: 400 });
			focusFieldWithBottomAt(500, field, { inside: container });

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

			it("scrolls a field the bottom chrome covers up to its top", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(ABOVE_KEYBOARD, field, { inside: form });
				bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: SAVE_BAR_HEIGHT,
				});
			});

			it("keeps the top of a field taller than the space above the bottom chrome below the top chrome", async () => {
				const HEADER_BOTTOM = 138;
				topChromeClearance.mockReturnValue(HEADER_BOTTOM);
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(ABOVE_KEYBOARD, field, {
					inside: form,
					height: 400,
				});
				bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: ABOVE_KEYBOARD - 400 - HEADER_BOTTOM,
				});
			});

			it("leaves a field above the bottom chrome where it is", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(SAVE_BAR_TOP, field, { inside: form });
				bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
				expect(scrollIntoView).not.toHaveBeenCalled();
			});

			it("reveals the field once bottom chrome finishes appearing over it", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(ABOVE_KEYBOARD, field, { inside: form });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				).dispatchEvent(new CustomEvent("introend"));
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({
					top: SAVE_BAR_HEIGHT,
				});
			});

			it("reveals a field the bottom chrome covers once focus moves to it", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(300, field, { inside: form });
				const lowerRow = document.createElement("div");
				form.append(lowerRow);
				bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				focusFieldWithBottomAt(
					SAVE_BAR_TOP + 40,
					document.createElement("input"),
					{ inside: lowerRow },
				);
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 40 });
			});

			it("ignores bottom chrome that holds the field", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				const composer = bottomChrome(
					{ top: SAVE_BAR_TOP, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);
				focusFieldWithBottomAt(ABOVE_KEYBOARD - 8, field, {
					inside: composer,
				});

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
			});

			it("ignores bottom chrome that comes before the field", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				bottomChrome(
					{ top: 100, height: SAVE_BAR_HEIGHT },
					{ inside: form },
				);
				focusFieldWithBottomAt(300, field, { inside: form });

				openKeyboard();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).not.toHaveBeenCalled();
			});

			it("ignores bottom chrome that takes no space", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const form = formAboveKeyboard();
				focusFieldWithBottomAt(300, field, { inside: form });
				bottomChrome({ top: 0, height: 0 }, { inside: form });

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

			it("scrolls the field once its scroll container shrinks under it", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const { container, shrinkTo } = scrollContainer({
					top: 62,
					height: SCREEN_HEIGHT - 62,
				});
				focusFieldWithBottomAt(500, field, { inside: container });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(scrollBy).not.toHaveBeenCalled();

				shrinkTo(400);
				reportResize();
				vi.advanceTimersToNextFrame();

				expect(scrollBy).toHaveBeenCalledExactlyOnceWith({ top: 38 });
			});

			it("stops watching the scroll container once the keyboard closes", async () => {
				const { installNativeInsets } = await loadNativeInsets();
				installNativeInsets();
				const { container } = scrollContainer({
					top: 62,
					height: SCREEN_HEIGHT - 62,
				});
				focusFieldWithBottomAt(500, field, { inside: container });
				openKeyboard();
				vi.advanceTimersToNextFrame();
				expect(disconnected).toBe(0);

				window.__iosInsets = IOS_INSETS;
				window.__reapplyInsets(IOS_INSETS);
				resizeViewport(SCREEN_HEIGHT);

				expect(disconnected).toBe(1);
			});
		});

		it("never scrolls while the keyboard is closed", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(700, field);

			resizeViewport(SCREEN_HEIGHT - KEYBOARD_HEIGHT);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("stops revealing once the keyboard closes", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(500, field);
			openKeyboard();
			vi.advanceTimersToNextFrame();

			window.__iosInsets = IOS_INSETS;
			window.__reapplyInsets(IOS_INSETS);
			resizeViewport(SCREEN_HEIGHT);
			resizeViewport(400);
			vi.advanceTimersToNextFrame();

			expect(scrollIntoView).not.toHaveBeenCalled();
		});

		it("leaves a focused control that takes no typing alone", async () => {
			const { installNativeInsets } = await loadNativeInsets();
			installNativeInsets();
			focusFieldWithBottomAt(700, document.createElement("button"));

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
		focusFieldWithBottomAt(ABOVE_KEYBOARD, field, { inside: container });
		window.__reapplyInsets(KEYBOARD_SHOWN);
		resizeViewport(ABOVE_KEYBOARD);
		vi.advanceTimersToNextFrame();

		bottomChrome(
			{ top: ABOVE_KEYBOARD - SAVE_BAR_HEIGHT, height: SAVE_BAR_HEIGHT },
			{ inside: container },
		).dispatchEvent(new CustomEvent("introend"));
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
		focusFieldWithBottomAt(700, field);

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
			focusFieldWithBottomAt(700, field);

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
