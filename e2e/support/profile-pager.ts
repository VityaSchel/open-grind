import {
	type CDPSession,
	expect,
	type Locator,
	type Page,
} from "@playwright/test";

import { ensureGridLocation, installTauriShim, TrustedTouch } from "./app";

const GRID_TILE = '.photo-grid a[href^="/profile/"]';

export const PANE = '[data-slot="profile-pane"]';
export const PROFILE_PAGER = '[data-slot="profile-pager"]';
export const PAGER_STOP = '[data-slot="profile-pager-stop"]';
export const ACTIVE_PANE = `${PANE}:not([aria-hidden])`;
export const NEIGHBOR_PANE = `${PANE}[aria-hidden="true"]`;

export function profilePager(page: Page): Locator {
	return page.locator(PROFILE_PAGER);
}

export function activeProfilePane(page: Page): Locator {
	return page.locator(ACTIVE_PANE);
}

export function profileUrl(profileId: number): RegExp {
	return new RegExp(`/profile/${profileId}$`);
}

export async function openBrowse(page: Page): Promise<number[]> {
	await installTauriShim(page);
	await page.goto("/");
	await page.locator("nav a").first().waitFor({ timeout: 180_000 });
	await ensureGridLocation(page);
	const tiles = page.locator(GRID_TILE);
	await tiles.nth(8).waitFor({ timeout: 60_000 });
	return tileIds(page);
}

export function tileIds(page: Page): Promise<number[]> {
	return page
		.locator(GRID_TILE)
		.evaluateAll((links) =>
			links.map((link) =>
				Number(link.getAttribute("href")?.split("/").at(-1)),
			),
		);
}

export async function openTile(
	page: Page,
	{ tiles, nth }: { tiles: number[]; nth: number },
): Promise<void> {
	await page.locator(`${GRID_TILE}[href="/profile/${tiles[nth]}"]`).click();
	await expect(page).toHaveURL(profileUrl(tiles[nth]!));
	await profileLoaded(page);
}

export async function openGridProfile(
	page: Page,
	{ nth }: { nth: number },
): Promise<number[]> {
	const tiles = await openBrowse(page);
	await openTile(page, { tiles, nth });
	return tiles;
}

export async function profileLoaded(page: Page): Promise<void> {
	await activeProfilePane(page)
		.getByRole("button", { name: "Profile menu" })
		.waitFor({ timeout: 60_000 });
}

export type PagerGeometry = {
	scrollLeft: number;
	width: number;
	scrollWidth: number;
	stops: number;
	activePosition: number;
};

export function pagerGeometry(page: Page): Promise<PagerGeometry> {
	return profilePager(page).evaluate(
		(pager, { stop, active }) => ({
			scrollLeft: pager.scrollLeft,
			width: pager.clientWidth,
			scrollWidth: pager.scrollWidth,
			stops: pager.querySelectorAll(stop).length,
			activePosition:
				parseFloat(
					pager.querySelector<HTMLElement>(active)?.style.left ??
						"NaN",
				) / 100,
		}),
		{ stop: PAGER_STOP, active: ACTIVE_PANE },
	);
}

export async function restsOn(
	page: Page,
	{ position }: { position: number },
): Promise<void> {
	await expect
		.poll(async () => {
			const { scrollLeft, width } = await pagerGeometry(page);
			return scrollLeft - position * width;
		})
		.toBe(0);
}

export async function swipeProfile(
	page: Page,
	{
		from = 0.85,
		to = 0.15,
		steps = 16,
		holdMs = 16,
		release = true,
		on = activeProfilePane(page).locator("h1"),
	}: {
		from?: number;
		to?: number;
		steps?: number;
		holdMs?: number;
		release?: boolean;
		on?: Locator;
	} = {},
): Promise<TrustedTouch> {
	const pager = (await profilePager(page).boundingBox())!;
	const target = (await on.boundingBox())!;
	const y = target.y + Math.min(target.height, 40) / 2;
	const touch = await TrustedTouch.attach(page);
	await touch.drag(
		page,
		{ x: pager.x + pager.width * from, y },
		{ x: pager.x + pager.width * to, y },
		{ steps, holdMs, release },
	);
	return touch;
}

export async function swipeToNext(
	page: Page,
	{ tiles, landing }: { tiles: number[]; landing: number },
): Promise<void> {
	await swipeProfile(page);
	await expect(page).toHaveURL(profileUrl(tiles[landing]!));
	await restsOn(page, { position: landing });
}

export async function swipeToPrevious(
	page: Page,
	{ tiles, landing }: { tiles: number[]; landing: number },
): Promise<void> {
	await swipeProfile(page, { from: 0.15, to: 0.85 });
	await expect(page).toHaveURL(profileUrl(tiles[landing]!));
	await restsOn(page, { position: landing });
}

type Point = { x: number; y: number };

export class TrustedFingers {
	readonly #down = new Map<number, Point>();

	private constructor(private readonly cdp: CDPSession) {}

	static async attach(page: Page): Promise<TrustedFingers> {
		return new TrustedFingers(await page.context().newCDPSession(page));
	}

	#dispatch({
		type,
		points,
	}: {
		type: "touchStart" | "touchMove" | "touchEnd";
		points: [number, Point][];
	}) {
		return this.cdp.send("Input.dispatchTouchEvent", {
			type,
			touchPoints: points.map(([id, { x, y }]) => ({ id, x, y })),
		});
	}

	down({ id, x, y }: { id: number } & Point) {
		this.#down.set(id, { x, y });
		return this.#dispatch({ type: "touchStart", points: [[id, { x, y }]] });
	}

	move(moves: Record<number, Point>) {
		for (const [id, point] of Object.entries(moves))
			this.#down.set(Number(id), point);
		return this.#dispatch({ type: "touchMove", points: [...this.#down] });
	}

	lift({ id }: { id: number }) {
		const point = this.#down.get(id)!;
		this.#down.delete(id);
		return this.#dispatch({ type: "touchEnd", points: [[id, point]] });
	}
}
