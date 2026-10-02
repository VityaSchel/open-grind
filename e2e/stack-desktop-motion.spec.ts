import { expect, type Page, test } from "@playwright/test";

import {
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
} from "./support/app";
import { APP_SETTINGS, openSettings, SETTINGS } from "./support/page-stack";
import { pauseOnceSliding, resumeSlides } from "./support/stack-layers";

const DESKTOP = { width: 1000, height: 800 };
const PHONE = { width: 390, height: 844 };

test.use({ viewport: DESKTOP });

const SETTINGS_STACK = {
	live: '[data-slot="page-stack-pane"]',
	snapshot: '[data-slot="page-stack-ghost"]',
	dim: '[data-slot="page-stack-dim"]',
};
const CHAT_STACK = {
	list: '[data-slot="live-stack-base"]',
	conversation: '[data-slot="live-stack-sheet"]',
	dim: '[data-slot="live-stack-dim"]',
};

type PaneSample = { x: number; opacity: number; edge: string };
type Frame = {
	front: PaneSample | null;
	back: PaneSample | null;
	scrim: number;
	settleMs: number[];
};

function recordTransition(
	page: Page,
	selectors: { front: string; back: string; dim: string },
): Promise<Frame[]> {
	return page.evaluate(
		({ front, back, dim }) =>
			new Promise<Frame[]>((resolve) => {
				const frames: Frame[] = [];
				const sampled = (selector: string) => {
					const pane = document.querySelector(selector);
					if (!pane) return null;
					const style = getComputedStyle(pane);
					return {
						x: new DOMMatrix(style.transform).m41,
						opacity: Number(style.opacity),
						edge: style.boxShadow,
					};
				};
				const started = performance.now();
				const sample = () => {
					const scrim = document.querySelector(dim);
					if (scrim)
						frames.push({
							front: sampled(front),
							back: sampled(back),
							scrim: Number(getComputedStyle(scrim).opacity),
							settleMs: (
								document
									.querySelector(front)
									?.getAnimations() ?? []
							).map((animation) =>
								Number(animation.effect?.getTiming().duration),
							),
						});
					if (performance.now() - started < 1500)
						requestAnimationFrame(sample);
					else resolve(frames);
				};
				requestAnimationFrame(sample);
			}),
		selectors,
	);
}

function expectFade(
	frames: Frame[],
	{
		direction,
		travel,
		settleMs,
	}: { direction: "in" | "out"; travel: number; settleMs: number },
) {
	const front = frames.flatMap(({ front }) => (front ? [front] : []));
	const back = frames.flatMap(({ back }) => (back ? [back] : []));
	const entering = direction === "in" ? front : front.toReversed();
	expect(front.length, "frames were sampled mid-transition").toBeGreaterThan(
		3,
	);

	for (const [index, { opacity, x }] of entering.entries()) {
		const earlier = entering[index - 1] ?? { opacity: 0, x: travel };
		expect(opacity, "opacity only rises").toBeGreaterThanOrEqual(
			earlier.opacity,
		);
		expect(x, "travel only shrinks").toBeLessThanOrEqual(earlier.x);
		expect(x).toBeGreaterThanOrEqual(0);
	}
	expect(
		front.filter(({ opacity }) => opacity > 0 && opacity < 1).length,
		"the front page is seen partly faded",
	).toBeGreaterThan(1);
	expect(Math.max(...front.map(({ x }) => x)) > 0).toBe(travel > 0);

	expect(
		new Set(back.map(({ x }) => x)),
		"the page behind stays put",
	).toEqual(new Set([0]));
	expect(new Set(back.map(({ opacity }) => opacity))).toEqual(new Set([1]));
	expect(new Set(frames.map(({ scrim }) => scrim)), "no scrim").toEqual(
		new Set([0]),
	);
	expect(
		new Set([...front, ...back].map(({ edge }) => edge)),
		"no edge line",
	).toEqual(new Set(["none"]));
	expect(new Set(frames.flatMap((frame) => frame.settleMs))).toEqual(
		new Set([settleMs]),
	);
}

for (const { platform, travel, settleMs } of [
	{ platform: "macos", travel: 0, settleMs: 250 },
	{ platform: "windows", travel: 40, settleMs: 300 },
	{ platform: "linux", travel: 0, settleMs: 250 },
]) {
	test(`on ${platform} a settings page fades in over the page behind and fades back out, moving ${travel} px`, async ({
		page,
	}) => {
		await openSettings(page, { platform });

		const pushed = recordTransition(page, {
			front: SETTINGS_STACK.live,
			back: SETTINGS_STACK.snapshot,
			dim: SETTINGS_STACK.dim,
		});
		await page.getByRole("link", { name: "App Settings" }).click();
		expectFade(await pushed, { direction: "in", travel, settleMs });
		await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
		await expect(page.locator(SETTINGS_STACK.live)).toHaveCSS(
			"opacity",
			"1",
		);

		const popped = recordTransition(page, {
			front: SETTINGS_STACK.snapshot,
			back: SETTINGS_STACK.live,
			dim: SETTINGS_STACK.dim,
		});
		await backLink(page).click();
		expectFade(await popped, { direction: "out", travel, settleMs });
		await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
		await expect(
			page.getByRole("link", { name: "App Settings" }),
		).toBeVisible();
	});
}

test.describe("a narrow macOS window", () => {
	test.use({ viewport: PHONE });

	test("a conversation fades in over the chat list and fades back out without moving either", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/chat");
		const conversation = page.locator('a[href^="/chat/"]:visible').nth(1);
		await conversation.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

		const opened = recordTransition(page, {
			front: CHAT_STACK.conversation,
			back: CHAT_STACK.list,
			dim: CHAT_STACK.dim,
		});
		await conversation.click();
		expectFade(await opened, { direction: "in", travel: 0, settleMs: 250 });
		await expect(page.locator(CHAT_STACK.conversation)).toHaveCSS(
			"opacity",
			"1",
		);

		const closed = recordTransition(page, {
			front: CHAT_STACK.conversation,
			back: CHAT_STACK.list,
			dim: CHAT_STACK.dim,
		});
		await page.getByRole("link", { name: "Back to chats" }).click();
		expectFade(await closed, {
			direction: "out",
			travel: 0,
			settleMs: 250,
		});
		await expect(page).toHaveURL(/\/chat$/);
		await expect(page.locator(CHAT_STACK.conversation)).toHaveCount(0);
		await expect(conversation).toBeVisible();
	});

	test("another conversation opens through the one still fading out", async ({
		page,
	}) => {
		await installTauriShim(page);
		await page.goto("/chat");
		const conversations = page.locator('a[href^="/chat/"]:visible');
		await conversations.nth(2).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
		const other = await conversations.nth(2).getAttribute("href");
		await conversations.nth(1).click();
		await expect(page.locator(CHAT_STACK.dim)).toHaveCount(0);

		const fading = pauseOnceSliding(page, {
			pane: CHAT_STACK.conversation,
		});
		await page.getByRole("link", { name: "Back to chats" }).click();
		await fading;
		const row = (await conversations.nth(2).boundingBox())!;
		await page.mouse.click(row.x + row.width / 2, row.y + row.height / 2);

		await expect(page).toHaveURL(new RegExp(`${other}$`));
		await resumeSlides(page);
		await expect(page.locator(CHAT_STACK.dim)).toHaveCount(0);
		await expect(page.locator(CHAT_STACK.conversation)).toHaveCSS(
			"opacity",
			"1",
		);
	});
});
