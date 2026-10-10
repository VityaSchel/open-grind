import { expect, type Page, test } from "@playwright/test";

import {
	backLink,
	FIRST_ROUTE_COMPILE_MS,
	installTauriShim,
	watchRendered,
} from "./support/app";
import { BLUR_MODES, setBlurMode } from "./support/layout-guard";
import {
	APP_SETTINGS,
	clickMeTab,
	dim,
	ghost,
	openAppSettings,
	openSettings,
	pane,
	SETTINGS,
	STACK_DIM,
	STACK_GHOST,
	stackSettled,
} from "./support/page-stack";
import {
	DARK_SCRIM,
	edgeLineColumns,
	expectEdgeJustLeftOf,
	pauseMidSlide,
	resumeSlides,
	scrimStrength,
} from "./support/stack-layers";
import {
	cancelSystemBack,
	commitSystemBack,
	progressSystemBack,
	startSystemBack,
	startSystemBackMidSlide,
} from "./support/system-back";

test.describe.configure({ timeout: 180_000 });

const documentOverflow = (page: Page) =>
	page.evaluate(() => ({
		x:
			document.documentElement.scrollWidth -
			document.documentElement.clientWidth,
		y:
			document.documentElement.scrollHeight -
			document.documentElement.clientHeight,
	}));

const panePosition = (page: Page) =>
	page.evaluate(() => {
		const live = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-pane"]',
		)!;
		const behind = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-ghost"]',
		);
		return {
			live: live.getBoundingClientRect().x,
			behind: behind?.getBoundingClientRect().x ?? null,
		};
	});

const centerIsInside = (page: Page, target: string, container: string) =>
	page.evaluate(
		([targetSelector, containerSelector]) => {
			const element = document.querySelector<HTMLElement>(targetSelector);
			const host = document.querySelector<HTMLElement>(containerSelector);
			if (!element || !host) return false;
			const box = element.getBoundingClientRect();
			const hit = document.elementFromPoint(
				box.x + box.width / 2,
				box.y + box.height / 2,
			);
			return hit !== null && host.contains(hit);
		},
		[target, container] as const,
	);

const stackingAgainstPane = (page: Page, overlay: string) =>
	page.evaluate((selector) => {
		const pane = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-pane"]',
		);
		const layer = document.querySelector<HTMLElement>(selector);
		if (!pane || !layer) return null;
		return {
			portalled: !pane.contains(layer),
			pane: Number(getComputedStyle(pane).zIndex),
			overlay: Number(getComputedStyle(layer).zIndex),
		};
	}, overlay);

const navBarHitTest = (page: Page) =>
	page.evaluate(() => {
		const browse = document.querySelector<HTMLElement>('nav a[href="/"]');
		if (!browse) return { present: false, onTop: false };
		const box = browse.getBoundingClientRect();
		const hit = document.elementFromPoint(
			box.x + box.width / 2,
			box.y + box.height / 2,
		);
		return { present: true, onTop: browse.contains(hit) };
	});

test("a pushed page enters over a snapshot of the page it came from", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await expect(ghost(page)).toHaveCount(0);

	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(dim(page)).toBeAttached();
	await expect(ghost(page)).toHaveCount(1);
	await expect(ghost(page)).toContainText("Sign Out");

	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(backLink(page)).toBeVisible();
});

test("My Albums slides onto the settings stack and swipes back off it", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });

	await page.getByRole("link", { name: "My Albums" }).click();
	await expect(dim(page)).toBeAttached();
	await expect(ghost(page)).toContainText("Sign Out");
	await expect(page).toHaveURL(/\/settings\/albums$/);
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });

	expect(await startSystemBack(page), "the Me screen waits behind").toBe(
		true,
	);
	await expect(ghost(page)).toContainText("Sign Out");
	await progressSystemBack(page, 0.8);
	await commitSystemBack(page);

	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`), {
		timeout: 5_000,
	});
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
});

test("both panes paint the app background so neither shows through", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(dim(page)).toBeAttached();

	const painted = await page.evaluate(() => {
		const body = getComputedStyle(document.body).backgroundColor;
		const live = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-pane"]',
		)!;
		const behind = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-ghost"]',
		)!;
		return {
			body,
			live: getComputedStyle(live).backgroundColor,
			behind: getComputedStyle(behind).backgroundColor,
		};
	});

	expect(painted.live).toBe(painted.body);
	expect(painted.behind).toBe(painted.body);
	expect(painted.body).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
});

test("the bottom nav bar stays above both panes, at rest and mid-slide", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	expect(await navBarHitTest(page)).toEqual({ present: true, onTop: true });

	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(dim(page)).toBeAttached();
	const midTransition = await navBarHitTest(page);

	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	expect(midTransition).toEqual({ present: true, onTop: true });
	expect(await navBarHitTest(page)).toEqual({ present: true, onTop: true });
});

test("neither axis of the document scrolls while two panes are on screen", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });

	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(dim(page)).toBeAttached();

	const midTransition = await documentOverflow(page);

	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });

	expect(midTransition).toEqual({ x: 0, y: 0 });
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });
});

test("the settings header keeps its viewport geometry while the panes move", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	const header = page.locator("nav.pblur").first();
	const atRest = await header.boundingBox();
	expect(atRest).toMatchObject({ x: 0, y: 0 });
	expect(atRest?.width).toBe(page.viewportSize()?.width);

	await expect(header).toHaveCSS("position", "fixed");
	const blurred = await header
		.locator(".pblur-layer")
		.first()
		.evaluate((layer) => getComputedStyle(layer).backdropFilter);
	expect(blurred).not.toBe("none");
});

test("the Back button pops with the same animation", async ({ page }) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	await backLink(page).click();
	await expect(dim(page)).toBeAttached();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));

	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(ghost(page)).toHaveCount(0);
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });
});

test("the detour through your own profile cuts on every hop, both ways and from the Me tab, while a pushed page still slides off", async ({
	page,
}) => {
	const viewProfile = page.getByRole("link", { name: "View your profile" });
	const editProfile = page.getByRole("link", { name: "Edit profile" });
	const openProfileEditor = async () => {
		await viewProfile.click();
		await editProfile.click();
		await expect(page).toHaveURL(/\/settings\/profile$/);
		await expect(pane(page)).toBeVisible();
	};
	await openSettings(page, { platform: "android" });
	const slid = await watchRendered(page, { selector: STACK_GHOST });

	await openProfileEditor();
	await backLink(page).click();
	await expect(editProfile).toBeVisible();
	await backLink(page).click();
	await expect(viewProfile).toBeVisible();

	await openProfileEditor();
	await clickMeTab(page);
	await expect(viewProfile).toBeVisible();
	expect(await slid(), "a page slid somewhere along the detour").toBe(false);

	await page.getByRole("link", { name: "Account Settings" }).click();
	await expect(page).toHaveURL(/\/settings\/account$/);
	await stackSettled(page);
	expect(await slid(), "a pushed page slides in").toBe(true);

	const slidOff = await watchRendered(page, { selector: STACK_DIM });
	await clickMeTab(page);
	await expect(viewProfile).toBeVisible();
	expect(await slidOff(), "and slides back off under the Me tab").toBe(true);
});

test("Back still slides down the stack after a profile was opened from the blocked list", async ({
	page,
}) => {
	const blockedList = /\/settings\/account\/blocked$/;
	await openSettings(page, { platform: "android" });
	await page.getByRole("link", { name: "Account Settings" }).click();
	await page.getByRole("link", { name: "Blocked users" }).click();
	await expect(page).toHaveURL(blockedList);
	await page.locator('a[href^="/profile/"]').first().click();
	await expect(page).toHaveURL(/\/profile\/\d+$/);
	await backLink(page).click();
	await expect(page).toHaveURL(blockedList);
	await expect(pane(page)).toBeVisible();

	for (const parent of [/\/settings\/account$/, /\/settings$/]) {
		const slid = await watchRendered(page, { selector: STACK_DIM });
		await backLink(page).click();
		await expect(page).toHaveURL(parent);
		await stackSettled(page);
		expect(await slid(), `onto ${parent}`).toBe(true);
	}
});

test("the panes follow the system back gesture's progress", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	expect(await startSystemBack(page)).toBe(true);

	await progressSystemBack(page, 0.25);
	const quarter = await panePosition(page);
	const quarterScrim = await scrimStrength(dim(page));

	await progressSystemBack(page, 0.75);
	const most = await panePosition(page);
	const mostScrim = await scrimStrength(dim(page));

	await cancelSystemBack(page);

	expect(quarter.live).toBeGreaterThan(0);
	expect(quarter.behind).toBeLessThan(0);
	expect(most.live).toBeGreaterThan(quarter.live);
	expect(most.behind).toBeGreaterThan(quarter.behind!);
	expect(quarterScrim).toBeCloseTo(DARK_SCRIM * 0.75, 2);
	expect(mostScrim).toBeCloseTo(DARK_SCRIM * 0.25, 2);
});

test("the page sliding off draws a one-pixel edge against the dimmed page underneath", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.25);
	const { live } = await panePosition(page);

	expect(live).toBeGreaterThan(0);
	await expectEdgeJustLeftOf(page, { x: live });
	await cancelSystemBack(page);
});

test("the Back button slides the page off with the same edge over the same scrim", async ({
	page,
}) => {
	const { width, height } = page.viewportSize()!;
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	const paused = pauseMidSlide(page, {
		pane: '[data-slot="page-stack-ghost"]',
	});
	await backLink(page).click();
	const leaving = await paused;

	expect(leaving).toBeLessThan(width);
	expect(await scrimStrength(dim(page))).toBeCloseTo(
		DARK_SCRIM * (1 - leaving / width),
		2,
	);
	await expectEdgeJustLeftOf(page, {
		x: leaving,
		clip: { x: Math.floor(leaving) - 4, y: 0, width: 8, height },
	});

	await resumeSlides(page);
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
});

test("a page at rest shows no edge along the left of the screen in any blur mode", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);
	const { height } = page.viewportSize()!;

	for (const mode of BLUR_MODES) {
		await setBlurMode(page, mode);
		expect(
			await edgeLineColumns(page, {
				clip: { x: 0, y: 0, width: 2, height },
			}),
			mode,
		).toEqual([]);
	}
});

test("committing the system back gesture navigates back", async ({ page }) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	await startSystemBack(page);
	await progressSystemBack(page, 0.8);
	await commitSystemBack(page);

	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`), {
		timeout: 5_000,
	});
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });
});

test("a back gesture during the slide-in picks the page up where it is, lets the finger drive the rest, and canceling finishes the slide-in", async ({
	page,
}) => {
	const width = page.viewportSize()!.width;
	await openSettings(page, { platform: "android" });

	const pickUp = startSystemBackMidSlide(
		page,
		'[data-slot="page-stack-pane"]',
	);
	await page.getByRole("link", { name: "App Settings" }).click();
	const { started, before, pickedUp, aFrameLater } = await pickUp;

	expect(started).toBe(true);
	expect(pickedUp, "the page stays where it was").toBeCloseTo(before, -1);
	expect(aFrameLater, "the page must not snap fully in").toBeGreaterThan(0);
	expect(aFrameLater).toBeLessThanOrEqual(before);
	await expect(ghost(page)).toContainText("Sign Out");

	await progressSystemBack(page, 0.5);
	expect((await panePosition(page)).live).toBeGreaterThanOrEqual(
		width / 2 - 1,
	);
	await expect
		.poll(async () => (await panePosition(page)).live)
		.toBeCloseTo(width / 2, 0);

	await cancelSystemBack(page);
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	expect((await panePosition(page)).live).toBe(0);
});

test("a back swipe started while the last one is still sliding out goes back from where that one lands", async ({
	page,
}) => {
	const PRIVACY = `${SETTINGS}/account/privacy`;
	await openSettings(page, { platform: "android" });
	await page.getByRole("link", { name: "Account Settings" }).click();
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	await page.getByRole("link", { name: "Privacy" }).click();
	await expect(page).toHaveURL(new RegExp(`${PRIVACY}$`));
	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });

	await startSystemBack(page);
	await progressSystemBack(page, 0.4);
	expect(await commitSystemBack(page)).toBe(false);

	expect(
		await startSystemBack(page),
		"the system owns the second swipe",
	).toBe(false);
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}/account$`));

	expect(await commitSystemBack(page)).toBe(true);
	await page.evaluate(() => history.back());
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));
	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(pane(page)).toContainText("Sign Out");
});

test("canceling the system back gesture stays on the page", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await openAppSettings(page);

	await startSystemBack(page);
	await progressSystemBack(page, 0.6);
	await cancelSystemBack(page);

	await expect(ghost(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	expect((await panePosition(page)).live).toBe(0);
});

test("a page opened directly leaves the system gesture to the platform", async ({
	page,
}) => {
	await installTauriShim(page, { platform: "android" });
	await page.goto(APP_SETTINGS);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await backLink(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	expect(await startSystemBack(page)).toBe(false);
	await expect(ghost(page)).toHaveCount(0);
});

test("reduced motion swaps pages at once, yet the back gesture still follows the finger with nothing sliding behind", async ({
	page,
}) => {
	await openSettings(page, { reducedMotion: "reduce", platform: "android" });
	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await expect(ghost(page)).toHaveCount(0);

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.25);
	const quarter = await panePosition(page);
	const quarterScrim = await scrimStrength(dim(page));
	await progressSystemBack(page, 0.75);
	const most = await panePosition(page);

	expect(most.live).toBeGreaterThan(quarter.live);
	expect(quarter.behind).toBe(0);
	expect(most.behind).toBe(0);
	expect(quarterScrim).toBeCloseTo(DARK_SCRIM * 0.75, 2);

	await commitSystemBack(page);
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`), {
		timeout: 5_000,
	});
	await expect(ghost(page)).toHaveCount(0);
});

test("a modal opened from settings covers both panes and the nav bar", async ({
	page,
}) => {
	await openSettings(page, { platform: "android" });
	await page.getByRole("button", { name: "Sign Out" }).click();
	await expect(
		page.locator('[data-slot="alert-dialog-content"]'),
	).toBeVisible();

	const stacking = await stackingAgainstPane(
		page,
		'[data-slot="alert-dialog-content"]',
	);
	expect(stacking?.portalled).toBe(true);
	expect(stacking?.overlay).toBeGreaterThan(stacking!.pane);
	expect(
		await centerIsInside(
			page,
			'[data-slot="alert-dialog-content"]',
			'[data-slot="alert-dialog-content"]',
		),
	).toBe(true);
	expect(
		await centerIsInside(
			page,
			'nav a[href="/"]',
			'[data-slot="alert-dialog-overlay"]',
		),
	).toBe(true);
});

test("a field popover in settings opens above the pane", async ({ page }) => {
	await installTauriShim(page);
	await page.goto("/settings/profile");

	const toggle = page.getByRole("button", { name: "Toggle list" }).first();
	await toggle.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await toggle.scrollIntoViewIfNeeded();
	await toggle.click();
	await expect(page.locator('[data-slot="combobox-content"]')).toBeVisible();

	const stacking = await stackingAgainstPane(
		page,
		'[data-slot="combobox-content"]',
	);
	expect(stacking?.portalled).toBe(true);
	expect(stacking?.overlay).toBeGreaterThan(stacking!.pane);
	await expect(
		page.locator('[data-slot="combobox-item"]').first(),
	).toBeVisible();
	expect(
		await centerIsInside(
			page,
			'[data-slot="combobox-item"]',
			'[data-slot="combobox-content"]',
		),
	).toBe(true);
	expect(await navBarHitTest(page)).toEqual({ present: true, onTop: true });
});
