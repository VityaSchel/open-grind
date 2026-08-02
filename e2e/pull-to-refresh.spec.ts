import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { installFakeOverscroll, type PullSnapshot } from "./support/pull";

const ARM_PX = 18;
const REFRESH_SETTLE_MS = 2400;

async function openInbox(page: Page) {
	await installTauriShim(page);
	await installFakeOverscroll(page);
	await page.goto("/chat");
	await page.locator("a[href^='/chat/']").first().waitFor({ timeout: 120_000 });
	await page.locator("[data-refresh-phase]").waitFor({ state: "attached" });
	await page.waitForTimeout(600);
}

async function driveInOneGesture<K extends string>(
	page: Page,
	keys: readonly K[],
	body: string,
): Promise<Record<K, PullSnapshot>> {
	const snapshots: Partial<Record<K, PullSnapshot>> =
		await page.evaluate(`(async () => {
		const scroller = [...document.querySelectorAll("div")].find(
			(el) =>
				getComputedStyle(el).overflowY === "auto" &&
				el.querySelector('a[href^="/chat/"]'),
		);
		if (!scroller) throw new Error("conversations scroller not found");
		const overlay = document.querySelector("[data-refresh-phase]");
		if (!overlay) throw new Error("refresh control not found");
		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
		const gesture = (px) => {
			scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: -8 }));
			scroller.__band = px;
			scroller.dispatchEvent(new Event("scroll"));
		};
		const spring = (px) => {
			scroller.__band = px;
			scroller.dispatchEvent(new Event("scroll"));
		};
		const lift = () => scroller.dispatchEvent(new Event("scrollend"));
		const snap = () => {
			const button = overlay.querySelector("button");
			const disc = overlay.querySelector("[data-refresh-disc]");
			const hint = button || disc ? null : overlay.querySelector("span");
			return {
				phase: overlay.dataset.refreshPhase,
				overlayHeight: Math.round(overlay.getBoundingClientRect().height),
				opacity: parseFloat(getComputedStyle(overlay).opacity),
				hint: hint ? hint.textContent.trim() : null,
				hasButton: !!button,
				disc: !!disc,
				spinning: !!overlay.querySelector("[data-refresh-disc][data-spinning]"),
				bandWrites: scroller.__bandWrites ?? 0,
			};
		};
		${body}
	})()`);

	const missing = keys.filter((key) => snapshots[key] === undefined);
	if (missing.length > 0)
		throw new Error(`the page returned no snapshot for ${missing.join(", ")}`);
	return snapshots as Record<K, PullSnapshot>;
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
		expect(steps.resting.overlayHeight).toBeLessThanOrEqual(1);

		expect(steps.pulling).toMatchObject({
			hint: "Pull to refresh",
			hasButton: false,
			overlayHeight: 8,
		});
		expect(steps.pulling.opacity).toBeGreaterThan(0.2);

		expect(steps.armed).toMatchObject({
			phase: "armed",
			hint: "Release to refresh",
		});
		expect(steps.armed.opacity).toBeGreaterThan(0.95);
		expect(steps.deep.overlayHeight).toBe(44);

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
			overlayHeight: 10,
		});
		expect(steps.collapsed.overlayHeight).toBeLessThanOrEqual(1);
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
		expect(steps.revealed.overlayHeight).toBeGreaterThanOrEqual(50);
		expect(steps.clicked).toMatchObject({
			phase: "refreshing",
			disc: true,
			spinning: true,
		});
		expect(steps.settled).toMatchObject({ phase: "idle", hasButton: true });
	});
});
