import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { driveInOneGesture, installFakeOverscroll } from "./support/pull";

const ARM_PX = 18;
const SHALLOW_PX = 6;
const REFRESH_SETTLE_MS = 2400;
const DISC_REST_MS = 400;
const ME = 123456000;
const CONVERSATIONS_MODULE_URL =
	"/src/lib/chat/conversations-context.svelte.ts";

async function openInbox(page: Page) {
	await installTauriShim(page);
	await installFakeOverscroll(page);
	await page.goto("/chat");
	await page
		.locator("a[href^='/chat/']")
		.first()
		.waitFor({ timeout: 120_000 });
	await page.locator("[data-refresh-phase]").waitFor({ state: "attached" });
	await page.waitForTimeout(600);
}

test.describe("pull to refresh", () => {
	test("a band pull arms, waits for the lift, then refreshes", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["resting", "pulling", "armed", "deep", "held", "fired", "settled"],
			`
			const resting = snap();
			gesture(0); await sleep(20);
			gesture(8); await sleep(30);
			const pulling = snap();
			gesture(${ARM_PX + 8}); await sleep(30);
			const armed = snap();
			gesture(44); await sleep(30);
			const deep = snap();
			await sleep(700);
			const held = snap();
			lift(); await sleep(80);
			const fired = snap();
			spring(0); await sleep(${REFRESH_SETTLE_MS});
			const settled = snap();
			return { resting, pulling, armed, deep, held, fired, settled };
		`,
		);

		expect(steps.resting).toMatchObject({ hasButton: false, disc: false });
		expect(steps.resting.bandHeight).toBeLessThanOrEqual(1);

		expect(steps.pulling).toMatchObject({
			hint: "Pull to refresh",
			hasButton: false,
			bandHeight: 8,
		});
		expect(steps.pulling.opacity).toBeGreaterThan(0.2);

		expect(steps.armed).toMatchObject({
			phase: "armed",
			hint: "Release to refresh",
		});
		expect(steps.armed.opacity).toBeGreaterThan(0.95);
		expect(steps.deep.bandHeight).toBe(44);

		expect(steps.held.phase).toBe("armed");
		expect(steps.fired).toMatchObject({
			phase: "refreshing",
			disc: true,
			spinning: true,
			bandWrites: 0,
		});

		expect(steps.settled.phase).toBe("idle");
		expect(steps.settled.hasButton).toBe(false);
	});

	test("a pull released below the threshold cancels, and the hint rides the spring back", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["cancelled", "springing", "collapsed"],
			`
			gesture(0); await sleep(20);
			gesture(8); await sleep(20);
			gesture(${ARM_PX - 4}); await sleep(20);
			lift(); await sleep(20);
			const cancelled = snap();
			spring(10); await sleep(16);
			const springing = snap();
			spring(0); await sleep(60);
			const collapsed = snap();
			return { cancelled, springing, collapsed };
		`,
		);

		expect(steps.cancelled.phase).toBe("idle");
		expect(steps.springing).toMatchObject({
			phase: "idle",
			hint: "Pull to refresh",
			bandHeight: 10,
		});
		expect(steps.collapsed.bandHeight).toBeLessThanOrEqual(1);
	});

	test("a gesture that arrives from mid-list never engages at the boundary", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["banded", "after"],
			`
			const inner = scroller.firstElementChild;
			inner.style.minHeight = "3000px";
			for (const top of [120, 40]) {
				scroller.__fakeTop = top;
				scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -8 }));
				scroller.dispatchEvent(new Event("scroll"));
				await sleep(200);
			}
			scroller.__fakeTop = 0;
			gesture(30); await sleep(200);
			const banded = snap();
			gesture(44); await sleep(30);
			lift(); await sleep(120);
			const after = snap();
			inner.style.minHeight = "";
			return { banded, after };
		`,
		);

		expect(steps.banded.phase).toBe("idle");
		expect(steps.after.phase).toBe("idle");
	});

	test("a fling into the boundary is ignored, a slow pull to the same depth is not", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["flung", "pulled", "fired"],
			`
			gesture(0); await sleep(30);
			gesture(70); await sleep(30);
			const flung = snap();
			gesture(0);
			lift();
			await sleep(400);
			gesture(6); await sleep(30);
			gesture(14); await sleep(30);
			gesture(22); await sleep(30);
			gesture(70); await sleep(30);
			const pulled = snap();
			lift(); await sleep(80);
			const fired = snap();
			spring(0); await sleep(${REFRESH_SETTLE_MS});
			return { flung, pulled, fired };
		`,
		);

		expect(steps.flung.phase).toBe("idle");
		expect(steps.pulled.phase).toBe("armed");
		expect(steps.fired.phase).toBe("refreshing");
	});

	test("a mouse wheel at the boundary offers a button instead of a band hint", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["revealed", "clicked", "settled"],
			`
			scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -40 }));
			await sleep(400);
			const revealed = snap();
			overlay.querySelector("button")?.click();
			await sleep(150);
			const clicked = snap();
			await sleep(${REFRESH_SETTLE_MS + 200});
			const settled = snap();
			return { revealed, clicked, settled };
		`,
		);

		expect(steps.revealed.hasButton).toBe(true);
		expect(steps.revealed.bandHeight).toBeGreaterThanOrEqual(50);
		expect(steps.clicked).toMatchObject({
			phase: "refreshing",
			disc: true,
			spinning: true,
		});
		expect(steps.settled).toMatchObject({ phase: "idle", hasButton: true });
	});

	test("a pull that starts while the disc of a finished refresh is still leaving shows its hint at the band", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["leaving", "pulled", "gone"],
			`
			const { getOrCreateConversationsState } = await import(
				"${CONVERSATIONS_MODULE_URL}"
			);
			const conversations = getOrCreateConversationsState(${ME});
			conversations.refreshing = true;
			await sleep(${DISC_REST_MS});
			const outroStarted = new Promise((resolve) =>
				document.addEventListener("outrostart", resolve, {
					capture: true,
					once: true,
				}),
			);
			conversations.refreshing = false;
			await outroStarted;
			const outro = overlay
				.getAnimations({ subtree: true })
				.filter((animation) => !(animation instanceof CSSAnimation));
			if (outro.length === 0) throw new Error("the disc outro is not running");
			outro.forEach((animation) => animation.pause());
			const leaving = snap();
			gesture(0); await sleep(20);
			gesture(${SHALLOW_PX}); await sleep(30);
			const pulled = snap();
			outro.forEach((animation) => animation.finish());
			await sleep(60);
			const gone = snap();
			return { leaving, pulled, gone };
		`,
		);

		expect(steps.leaving).toMatchObject({ disc: true, hint: null });
		expect(steps.pulled).toMatchObject({
			phase: "pulling",
			disc: true,
			hint: "Pull to refresh",
			bandHeight: SHALLOW_PX,
		});
		expect(steps.pulled.hintBottom).toBeLessThanOrEqual(SHALLOW_PX);
		expect(steps.pulled.opacity).toBeLessThan(1);
		expect(steps.gone).toMatchObject({
			disc: false,
			hint: "Pull to refresh",
			bandHeight: SHALLOW_PX,
			hintBottom: steps.pulled.hintBottom,
		});
	});

	test("the disc of a finished refresh stays whole and opaque until it starts leaving", async ({
		page,
	}) => {
		await openInbox(page);
		const steps = await driveInOneGesture(
			page,
			["spinning", "finished"],
			`
			const { getOrCreateConversationsState } = await import(
				"${CONVERSATIONS_MODULE_URL}"
			);
			const conversations = getOrCreateConversationsState(${ME});
			conversations.refreshing = true;
			await sleep(${DISC_REST_MS});
			const spinning = snap();
			conversations.refreshing = false;
			await null;
			const finished = snap();
			return { spinning, finished };
		`,
		);

		const whole = { disc: true, discClippedPx: 0, discOpacity: 1 };
		expect(steps.spinning).toMatchObject(whole);
		expect(steps.finished).toMatchObject(whole);
	});
});
