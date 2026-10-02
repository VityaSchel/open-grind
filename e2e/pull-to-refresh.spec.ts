import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	MESSAGE_ROW,
	wheel,
} from "./support/app";
import { openTaps, TAP_ROW } from "./support/interest-pager";
import {
	BUTTON_ROW_PX,
	CONVERSATION_ROW,
	CONVERSATIONS_SCROLLER,
	driveInOneGesture,
	openInbox,
	refreshButton,
	topOf,
} from "./support/pull";

const ARM_PX = 18;
const SHALLOW_PX = 6;
const REFRESH_SETTLE_MS = 2400;
const DISC_REST_MS = 400;
const ME = 123456000;
const CONVERSATIONS_MODULE_URL =
	"/src/lib/chat/conversations-context.svelte.ts";
const SCROLL_AWAY_PX = 10;
const MESSAGES_SCROLLER = '[data-slot="messages-scroller"]';
const SCREEN_TALLER_THAN_ITS_CONTENT = { width: 420, height: 3000 };
const ROOM_ABOVE_COMPOSER_PROPERTY = "--refresh-inset-bottom";

async function openRefreshableTaps(page: Page) {
	await openTaps(page);
	await page
		.locator("[data-refresh-phase]")
		.first()
		.waitFor({ state: "attached" });
	await page.waitForTimeout(600);
}

async function openConversation(page: Page) {
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await page
		.locator(MESSAGE_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page
		.locator(`${MESSAGES_SCROLLER} ~ [data-refresh-phase]`)
		.waitFor({ state: "attached" });
	await page.waitForTimeout(600);
}

const bottomOf = (row: Locator) =>
	row.evaluate((el) => el.getBoundingClientRect().bottom);

const floorDistance = (scroller: Locator) =>
	scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);

const scrollRange = (scroller: Locator) =>
	scroller.evaluate((el) => el.scrollHeight - el.clientHeight);

const roomAboveComposer = (scroller: Locator) =>
	scroller.evaluate(
		(el: HTMLElement, room) => el.style.getPropertyValue(room),
		ROOM_ABOVE_COMPOSER_PROPERTY,
	);

async function revealButtonOver(
	page: Page,
	{ row, towardBoundary = -100 }: { row: Locator; towardBoundary?: number },
) {
	const box = await row.boundingBox();
	if (!box) throw new Error("the row is not on screen");
	const pointer = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await wheel(page, pointer, towardBoundary);
	await expect(refreshButton(page)).toBeVisible();
	return pointer;
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

	for (const list of [
		{ name: "the inbox", open: openInbox, row: CONVERSATION_ROW },
		{ name: "the taps list", open: openRefreshableTaps, row: TAP_ROW },
	]) {
		test(`on ${list.name} the button takes a row of its own above the first entry, and gives it back once the reader scrolls on`, async ({
			page,
		}) => {
			await list.open(page);
			const firstRow = page.locator(list.row).first();
			const restingTop = await topOf(firstRow);

			const pointer = await revealButtonOver(page, { row: firstRow });
			await expect
				.poll(() => topOf(firstRow))
				.toBe(restingTop + BUTTON_ROW_PX);
			const button = await refreshButton(page).boundingBox();
			if (!button) throw new Error("the Refresh button has no box");
			expect(button.y + button.height).toBeLessThan(
				restingTop + BUTTON_ROW_PX,
			);

			await wheel(page, pointer, SCROLL_AWAY_PX);
			await expect(refreshButton(page)).toBeHidden();
			await expect
				.poll(() => topOf(firstRow))
				.toBe(restingTop - SCROLL_AWAY_PX);
		});
	}

	test("a clicked refresh spins in the button's row without moving the list", async ({
		page,
	}) => {
		await openInbox(page);
		const firstRow = page.locator(CONVERSATION_ROW).first();
		const restingTop = await topOf(firstRow);
		await revealButtonOver(page, { row: firstRow });
		await expect
			.poll(() => topOf(firstRow))
			.toBe(restingTop + BUTTON_ROW_PX);

		const rowTops = await firstRow.evaluateHandle((row) => {
			const seen = new Set<number>();
			const sample = () => {
				seen.add(row.getBoundingClientRect().top);
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
			return seen;
		});
		await refreshButton(page).click();
		await expect(
			page.locator("[data-refresh-disc][data-spinning]"),
		).toBeVisible();
		await expect(refreshButton(page)).toBeVisible();

		expect(await rowTops.evaluate((seen) => [...seen])).toEqual([
			restingTop + BUTTON_ROW_PX,
		]);
	});

	test("in a conversation the button takes its room above the composer and keeps it while the reader is scrolled up", async ({
		page,
	}) => {
		await openConversation(page);
		const scroller = page.locator(MESSAGES_SCROLLER);
		const newest = page.locator(MESSAGE_ROW).last();
		const restingBottom = await bottomOf(newest);

		const pointer = await revealButtonOver(page, {
			row: newest,
			towardBoundary: 100,
		});
		await expect
			.poll(() => roomAboveComposer(scroller))
			.toBe(`${BUTTON_ROW_PX}px`);
		expect(await bottomOf(newest)).toBe(restingBottom - BUTTON_ROW_PX);
		expect(await floorDistance(scroller)).toBeLessThanOrEqual(1);
		const button = await refreshButton(page).boundingBox();
		const composer = await page
			.locator('[data-slot="message-composer"]')
			.boundingBox();
		if (!button || !composer)
			throw new Error("the Refresh button or the composer has no box");
		expect(button.y).toBeGreaterThan(restingBottom - BUTTON_ROW_PX);
		expect(button.y + button.height).toBeLessThan(composer.y);

		await wheel(page, pointer, -SCROLL_AWAY_PX);
		await expect(refreshButton(page)).toBeHidden();
		expect(await floorDistance(scroller)).toBe(SCROLL_AWAY_PX);
		expect(await bottomOf(newest)).toBe(
			restingBottom - BUTTON_ROW_PX + SCROLL_AWAY_PX,
		);

		await wheel(page, pointer, 100);
		await expect(refreshButton(page)).toBeVisible();
		expect(await bottomOf(newest)).toBe(restingBottom - BUTTON_ROW_PX);
	});

	test("a message sent from the floor lands above the button's room without closing it", async ({
		page,
	}) => {
		await openConversation(page);
		const scroller = page.locator(MESSAGES_SCROLLER);
		const newest = page.locator(MESSAGE_ROW).last();
		const restingBottom = await bottomOf(newest);
		await revealButtonOver(page, { row: newest, towardBoundary: 100 });
		await expect
			.poll(() => roomAboveComposer(scroller))
			.toBe(`${BUTTON_ROW_PX}px`);
		expect(await bottomOf(newest)).toBe(restingBottom - BUTTON_ROW_PX);

		const rooms = await scroller.evaluateHandle((el: HTMLElement, room) => {
			const seen = new Set<string>();
			const sample = () => {
				seen.add(el.style.getPropertyValue(room));
				requestAnimationFrame(sample);
			};
			requestAnimationFrame(sample);
			return seen;
		}, ROOM_ABOVE_COMPOSER_PROPERTY);
		const sent = `sent from the floor ${Date.now()}`;
		await page.getByRole("textbox").fill(sent);
		await page.getByRole("textbox").press("Enter");
		await expect(newest).toContainText(sent);
		await expect.poll(() => floorDistance(scroller)).toBeLessThanOrEqual(1);
		await expect(refreshButton(page)).toBeVisible();

		expect(await bottomOf(newest)).toBeCloseTo(
			restingBottom - BUTTON_ROW_PX,
			0,
		);
		expect(await rooms.evaluate((seen) => [...seen])).toEqual([
			`${BUTTON_ROW_PX}px`,
		]);
	});

	test("a message sent while the button's room is still opening lands on the floor all the same", async ({
		page,
	}) => {
		await openConversation(page);
		const scroller = page.locator(MESSAGES_SCROLLER);
		const newest = page.locator(MESSAGE_ROW).last();
		const sent = `sent while the room opens ${Date.now()}`;
		await page.getByRole("textbox").fill(sent);
		const box = await newest.boundingBox();
		if (!box) throw new Error("the newest message is not on screen");

		await wheel(
			page,
			{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
			100,
		);
		await page.getByRole("textbox").press("Enter");

		await expect(newest).toContainText(sent);
		await expect
			.poll(() => roomAboveComposer(scroller))
			.toBe(`${BUTTON_ROW_PX}px`);
		await expect.poll(() => floorDistance(scroller)).toBeLessThanOrEqual(1);
		await expect(refreshButton(page)).toBeVisible();
	});

	for (const surface of [
		{
			name: "an inbox",
			open: openInbox,
			scroller: CONVERSATIONS_SCROLLER,
			nearestRow: (page: Page) => page.locator(CONVERSATION_ROW).first(),
			edgeOf: topOf,
			towardBoundary: -100,
			shift: BUTTON_ROW_PX,
		},
		{
			name: "a conversation",
			open: openConversation,
			scroller: MESSAGES_SCROLLER,
			nearestRow: (page: Page) => page.locator(MESSAGE_ROW).last(),
			edgeOf: bottomOf,
			towardBoundary: 100,
			shift: -BUTTON_ROW_PX,
		},
	]) {
		test(`${surface.name} shorter than the screen makes the button's room out of its spare height, not out of new scroll range`, async ({
			page,
		}) => {
			await page.setViewportSize(SCREEN_TALLER_THAN_ITS_CONTENT);
			await surface.open(page);
			const scroller = page.locator(surface.scroller);
			const row = surface.nearestRow(page);
			const restingEdge = await surface.edgeOf(row);
			const restingRange = await scrollRange(scroller);
			expect(restingRange).toBeLessThanOrEqual(1);

			await revealButtonOver(page, {
				row,
				towardBoundary: surface.towardBoundary,
			});
			await expect
				.poll(() => surface.edgeOf(row))
				.toBe(restingEdge + surface.shift);

			expect(await scrollRange(scroller)).toBe(restingRange);
		});
	}
});
