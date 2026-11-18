import { afterEach, describe, expect, it, vi } from "vitest";

import { settleLast } from "#lib/components/navigation/stack/stack-test-helpers.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import { pushedFromChain } from "./hierarchy";
import { androidMotion, go, makeStack, push } from "./page-stack-test-helpers";

afterEach(async () => {
	document.body.innerHTML = "";
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("PageStackState navigation", () => {
	it("enters a pushed page from the right over a snapshot of the old one", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;

		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
		});
		expect(stack.liveRole).toBe("front");
		expect(stack.ghost?.path).toBe("/settings");
		expect(applied).toEqual([1, 1]);

		start?.();
		expect(animations.at(-1)).toMatchObject({
			from: 1,
			to: 0,
			easing: androidMotion.commitEasing,
		});

		await settleLast(animations);
		expect(stack.ghost).toBeNull();
	});

	it("slides a popped page away to the right over the page it was pushed from", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		applied.length = 0;

		const start = await go(harness, {
			from: "/settings/app",
			to: "/settings",
		});
		expect(stack.liveRole).toBe("back");
		expect(stack.ghost?.path).toBe("/settings/app");
		expect(applied).toEqual([0, 0]);

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("puts the panes at the start of a slide before the ghost mounts", async () => {
		const harness = makeStack();
		const { applied } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		applied.length = 0;

		const navigating = go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});

		expect(applied, "positioned in the same task as the ghost").toEqual([
			0,
		]);
		await navigating;
		expect(applied).toEqual([0, 0]);
	});

	it("slides a history move over several levels back onto the root it was pushed from", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/account" });
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});

		const start = await go(harness, {
			from: "/settings/account/privacy",
			to: "/settings",
			delta: -2,
		});
		expect(stack.liveRole).toBe("back");

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
	});

	it("cuts a pop onto a page it was never pushed from, even when another one waits beneath", async () => {
		const harness = makeStack({ at: "/settings/account" });
		const { stack, applied, animations } = harness;
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/privacy",
		});
		const slides = animations.length;

		const start = await go(harness, {
			from: "/settings/account/privacy",
			to: "/settings",
		});

		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(slides);
		expect(applied.at(-1)).toBe(0);
	});

	it("slides down every level history says was pushed before the stack was mounted again", async () => {
		const harness = makeStack({
			before: ["/settings", "/settings/account"],
			at: "/settings/account/blocked",
			pushedFrom: [{ path: "/settings" }, { path: "/settings/account" }],
		});
		const { stack, animations } = harness;
		expect(
			stack.offersSwipeBack,
			"no copy of the page beneath was cached",
		).toBe(false);

		for (const [from, to] of [
			["/settings/account/blocked", "/settings/account"],
			["/settings/account", "/settings"],
		] as const) {
			const slides = animations.length;
			const start = await go(harness, { from, to, delta: -1 });
			expect(stack.ghost?.path).toBe(from);
			start?.();
			expect(animations).toHaveLength(slides + 1);
			expect(animations.at(-1)).toMatchObject({ from: 0, to: 1 });
			await settleLast(animations);
		}
	});

	it("offers the swipe again on a page mounted anew over a page it cached before leaving the stack", async () => {
		const first = makeStack();
		await push(first, { from: "/settings", to: "/settings/account" });
		await push(first, {
			from: "/settings/account",
			to: "/settings/account/blocked",
		});
		await go(first, {
			from: "/settings/account/blocked",
			to: "/profile/1",
		});
		first.history.go(-1);
		first.snapshots.navigating();
		first.snapshots.navigated({ type: "popstate" });

		const { stack } = makeStack({
			remounting: first,
			pushedFrom: pushedFromChain({
				pathname: "/settings/account/blocked",
				earlier: ["/settings/account", "/settings"],
			}),
		});

		expect(stack.offersSwipeBack).toBe(true);
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings/account");
	});

	it("cuts a backward history move that lands deeper instead of pushing it in", async () => {
		const harness = makeStack({ before: ["/settings/app"] });
		const { stack, animations } = harness;

		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
			delta: -1,
		});

		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
		expect(stack.offersSwipeBack).toBe(false);
	});

	it("treats a forward history move as a push", async () => {
		const harness = makeStack({ later: ["/settings/app"] });
		const { stack, animations } = harness;

		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
			delta: 1,
		});
		expect(stack.liveRole).toBe("front");

		start?.();
		expect(animations.at(-1)).toMatchObject({ from: 1, to: 0 });
	});

	it("does not animate between siblings", async () => {
		const harness = makeStack({ at: "/settings/app" });
		const { stack, animations } = harness;
		const start = await go(harness, {
			from: "/settings/app",
			to: "/settings/profile",
		});
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
	});

	it("takes no copy of a page a replace navigation writes over, keeping the swipe onto the page beneath", async () => {
		const harness = makeStack({ at: "/settings/albums" });
		const { stack, pane } = harness;
		await push(harness, {
			from: "/settings/albums",
			to: "/settings/albums/new",
		});
		const cloned = vi.spyOn(pane, "cloneNode");

		await go(harness, {
			from: "/settings/albums/new",
			to: "/settings/albums/1",
			replace: true,
		});

		expect(cloned).not.toHaveBeenCalled();
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings/albums");
	});

	it("reveals the page history goes back to after a cut to a page that is not its child", async () => {
		const harness = makeStack({ at: "/settings/account" });
		const { stack } = harness;
		await push(harness, {
			from: "/settings/account",
			to: "/settings/account/security",
		});

		await go(harness, {
			from: "/settings/account/security",
			to: "/settings/app/discreet-icon",
		});

		expect(stack.ghost).toBeNull();
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings/account/security");
	});

	it("does not animate leaving the stack", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await go(harness, { from: "/settings", to: "/chat" });
		expect(stack.ghost).toBeNull();
		expect(animations).toHaveLength(0);
	});

	it("swaps pages at once under reduced motion, keeping the page beneath for the back gesture", async () => {
		const harness = makeStack({ reducedMotion: true });
		const { stack, animations } = harness;
		const start = await go(harness, {
			from: "/settings",
			to: "/settings/app",
		});
		expect(stack.ghost).toBeNull();
		expect(start).toBeUndefined();
		expect(animations).toHaveLength(0);
		expect(stack.offersSwipeBack).toBe(true);
	});
});

describe("PageStackState state under interruption", () => {
	it("drops a gesture still in flight when a navigation starts", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.tracking).toBe(true);

		await go(harness, { from: "/settings/app", to: "/settings/profile" });

		expect(
			stack.tracking,
			"a live gesture must not outlive a navigation",
		).toBe(false);
	});

	it("turns a push around from where it had reached, not from a full page", async () => {
		const harness = makeStack();
		const { stack, applied, animations } = harness;
		const entering = await go(harness, {
			from: "/settings",
			to: "/settings/app",
		});
		entering?.();
		animations.at(-1)!.reached = 0.7;

		const leaving = await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		expect(stack.ghost?.path).toBe("/settings/app");
		expect(applied.at(-1)).toBe(0.7);
		leaving?.();
		expect(animations.at(-1)).toMatchObject({ from: 0.7, to: 1 });
	});

	it("ignores the settle starter of a superseded navigation", async () => {
		const harness = makeStack();
		const { animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		const stale = await go(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});
		await go(harness, {
			from: "/settings/app/credits",
			to: "/settings/profile",
		});
		const before = animations.length;

		stale?.();

		expect(
			animations.length,
			"the stale closure animated the wrong pair",
		).toBe(before);
	});
});

describe("PageStackState after a language change", () => {
	it("stops revealing the cached page to the back gesture, while Back still slides over a fresh copy", async () => {
		const harness = makeStack();
		const { stack } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });

		await setLocale({ locale: "en-XA" });

		expect(stack.offersSwipeBack).toBe(false);
		expect(stack.beginSwipeBack()).toBe(false);

		await go(harness, {
			from: "/settings/app",
			to: "/settings",
			delta: -1,
		});
		expect(stack.liveRole).toBe("back");
		expect(stack.ghost?.path).toBe("/settings/app");
	});

	it("offers the swipe again from the next push, over the copy it takes in the new language", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		await setLocale({ locale: "en-XA" });

		await push(harness, {
			from: "/settings/app",
			to: "/settings/app/credits",
		});
		expect(stack.beginSwipeBack()).toBe(true);
		expect(stack.ghost?.path).toBe("/settings/app");
		stack.cancelSwipeBack();
		await settleLast(animations);

		await go(harness, {
			from: "/settings/app/credits",
			to: "/settings/app",
			delta: -1,
		});
		expect(stack.offersSwipeBack).toBe(false);
	});

	it("lets a swipe in progress finish over the page it revealed", async () => {
		const harness = makeStack();
		const { stack, animations } = harness;
		await push(harness, { from: "/settings", to: "/settings/app" });
		stack.beginSwipeBack();
		stack.trackSwipeBack(0.3);

		await setLocale({ locale: "en-XA" });

		expect(stack.tracking).toBe(true);
		expect(stack.ghost?.path).toBe("/settings");

		stack.cancelSwipeBack();
		await settleLast(animations);
		expect(stack.ghost).toBeNull();
		expect(stack.beginSwipeBack()).toBe(false);
	});
});
