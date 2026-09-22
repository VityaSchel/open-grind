import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import {
	APP_SETTINGS,
	cancelSystemBack,
	commitSystemBack,
	dim,
	FIRST_ROUTE_COMPILE_MS,
	ghost,
	openAppSettings,
	openSettings,
	pane,
	progressSystemBack,
	SETTINGS,
	startSystemBack,
} from "./support/page-stack";

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
		const shade = document.querySelector<HTMLElement>(
			'[data-slot="page-stack-dim"]',
		);
		return {
			live: live.getBoundingClientRect().x,
			behind: behind?.getBoundingClientRect().x ?? null,
			dim: Number(shade?.style.opacity ?? -1),
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
	await openSettings(page);
	await expect(ghost(page)).toHaveCount(0);

	await openAppSettings(page);
	await expect(ghost(page)).toHaveCount(0);
	await expect(
		page.getByRole("link", { name: "Back", exact: true }),
	).toBeVisible();
});

test("both panes paint the app background so neither shows through", async ({
	page,
}) => {
	await openSettings(page);
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
	await openSettings(page);
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
	await openSettings(page);
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });

	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(dim(page)).toBeAttached();

	const midTransition = await documentOverflow(page);
	const ghostCount = await ghost(page).count();

	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });

	expect(ghostCount).toBe(1);
	expect(midTransition).toEqual({ x: 0, y: 0 });
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });
});

test("the settings header keeps its viewport geometry while the panes move", async ({
	page,
}) => {
	await openSettings(page);
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
	await openSettings(page);
	await openAppSettings(page);

	await page.getByRole("link", { name: "Back", exact: true }).click();
	await expect(dim(page)).toBeAttached();
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`));

	await expect(dim(page)).toHaveCount(0, { timeout: 5_000 });
	await expect(ghost(page)).toHaveCount(0);
	expect(await documentOverflow(page)).toEqual({ x: 0, y: 0 });
});

test("the panes follow the system back gesture's progress", async ({
	page,
}) => {
	await openSettings(page);
	await openAppSettings(page);

	expect(await startSystemBack(page)).toBe(true);

	await progressSystemBack(page, 0.25);
	const quarter = await panePosition(page);

	await progressSystemBack(page, 0.75);
	const most = await panePosition(page);

	await cancelSystemBack(page);

	expect(quarter.live).toBeGreaterThan(0);
	expect(quarter.behind).toBeLessThan(0);
	expect(most.live).toBeGreaterThan(quarter.live);
	expect(most.behind).toBeGreaterThan(quarter.behind!);
	expect(most.dim).toBeLessThan(quarter.dim);
	expect(quarter.dim).toBeLessThanOrEqual(0.1);
});

test("committing the system back gesture navigates back", async ({ page }) => {
	await openSettings(page);
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

test("a back swipe started while the last one is still sliding out goes back from where that one lands", async ({
	page,
}) => {
	const PRIVACY = `${SETTINGS}/account/privacy`;
	await openSettings(page);
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
	await openSettings(page);
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
	await installTauriShim(page);
	await page.goto(APP_SETTINGS);
	await pane(page).waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	await page
		.getByRole("link", { name: "Back", exact: true })
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });

	expect(await startSystemBack(page)).toBe(false);
	await expect(ghost(page)).toHaveCount(0);
});

test("reduced motion swaps pages at once, yet the back gesture still follows the finger with nothing sliding behind", async ({
	page,
}) => {
	await openSettings(page, "reduce");
	await page.getByRole("link", { name: "App Settings" }).click();
	await expect(page).toHaveURL(new RegExp(`${APP_SETTINGS}$`));
	await expect(ghost(page)).toHaveCount(0);

	expect(await startSystemBack(page)).toBe(true);
	await progressSystemBack(page, 0.25);
	const quarter = await panePosition(page);
	await progressSystemBack(page, 0.75);
	const most = await panePosition(page);

	expect(most.live).toBeGreaterThan(quarter.live);
	expect(quarter.behind).toBe(0);
	expect(most.behind).toBe(0);
	expect(quarter.dim).toBeGreaterThan(0);

	await commitSystemBack(page);
	await expect(page).toHaveURL(new RegExp(`${SETTINGS}$`), {
		timeout: 5_000,
	});
	await expect(ghost(page)).toHaveCount(0);
});

test("a modal opened from settings covers both panes and the nav bar", async ({
	page,
}) => {
	await openSettings(page);
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
