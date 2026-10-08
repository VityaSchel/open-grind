import { expect, type Locator, type Page, test } from "@playwright/test";

import { installTauriShim, openGrid, wheel } from "./support/app";
import { routeDemoThroughFaultHook } from "./support/demo-faults";
import { refreshButton } from "./support/pull";

const SCROLLER = ".pull-scroller";
const PROFILE_LINK = '[data-slot="grid-cells"] a[href^="/profile/"]';
const TOAST = "[data-sonner-toast]";
const FIRST_RETRY_MS = 2_000;
const SECOND_RETRY_MS = 6_000;
const MARGIN_MS = 300;
const LATENCIES_MS = [0, 60, 300];
const LAYOUTS = [
	{ name: "phone", viewport: { width: 412, height: 800 } },
	{ name: "desktop", viewport: { width: 1280, height: 800 } },
];

type CascadeRequest = { page: number; at: number };
type CascadeLog = {
	failing: boolean;
	latencyMs: number;
	status: number;
	requests: CascadeRequest[];
};
type FaultyWindow = Window & { __cascade: CascadeLog };

async function injectCascadeFaults(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const log: CascadeLog = {
			failing: false,
			latencyMs: 0,
			status: 503,
			requests: [],
		};
		Object.assign(window, {
			__cascade: log,
			__demoFault: async ({ path }: { path: string }) => {
				const url = new URL(path, location.origin);
				if (url.pathname !== "/v4/cascade") return undefined;
				const pageNumber = Number(
					url.searchParams.get("pageNumber") ?? 0,
				);
				log.requests.push({ page: pageNumber, at: performance.now() });
				if (!log.failing || pageNumber < 1) return undefined;
				if (log.latencyMs > 0)
					await new Promise((resolve) =>
						setTimeout(resolve, log.latencyMs),
					);
				return {
					status: log.status,
					body: { message: "Request failed" },
				};
			},
		});
	});
	await routeDemoThroughFaultHook(page);
}

const cascadeRequests = (page: Page) =>
	page.evaluate(() => (window as unknown as FaultyWindow).__cascade.requests);

async function nextPageRequests(page: Page): Promise<CascadeRequest[]> {
	return (await cascadeRequests(page)).filter(({ page }) => page >= 1);
}

function failNextPages({
	page,
	latencyMs,
	status,
}: {
	page: Page;
	latencyMs: number;
	status: number;
}) {
	return page.evaluate(
		({ latency, failWith }) => {
			const log = (window as unknown as FaultyWindow).__cascade;
			log.failing = true;
			log.latencyMs = latency;
			log.status = failWith;
			log.requests = [];
		},
		{ latency: latencyMs, failWith: status },
	);
}

function stopFailing(page: Page) {
	return page.evaluate(() => {
		(window as unknown as FaultyWindow).__cascade.failing = false;
	});
}

async function openFailingGrid({
	page,
	latencyMs,
	status,
}: {
	page: Page;
	latencyMs: number;
	status: number;
}): Promise<Locator> {
	await installTauriShim(page);
	await injectCascadeFaults(page);
	await openGrid(page);
	await page.locator(PROFILE_LINK).first().waitFor({ timeout: 60_000 });
	expect(
		await cascadeRequests(page),
		"the demo transport asks the fault hook",
	).not.toHaveLength(0);
	await failNextPages({ page, latencyMs, status });
	return page.locator(SCROLLER);
}

const scrollToBottom = (scroller: Locator) =>
	scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));

const scrollHeight = (scroller: Locator) =>
	scroller.evaluate((el) => el.scrollHeight);

async function requestsWithin({
	page,
	since,
	ms,
}: {
	page: Page;
	since: number;
	ms: number;
}): Promise<number> {
	await page.waitForFunction(
		(until) => performance.now() >= until,
		since + ms,
	);
	const requests = await nextPageRequests(page);
	return requests.filter(({ at }) => at < since + ms).length;
}

async function nthRequest({
	page,
	nth,
}: {
	page: Page;
	nth: number;
}): Promise<CascadeRequest> {
	await expect
		.poll(async () => (await nextPageRequests(page)).length)
		.toBeGreaterThanOrEqual(nth);
	const request = (await nextPageRequests(page))[nth - 1];
	if (request === undefined) throw new Error(`no request number ${nth}`);
	return request;
}

const retryButton = (page: Page) => page.getByRole("button", { name: "Retry" });

async function expectOneErrorAndNoToast(page: Page): Promise<void> {
	await expect(retryButton(page)).toBeVisible();
	expect(await retryButton(page).count(), "Retry buttons").toBe(1);
	expect(await page.locator(TOAST).count(), "toasts").toBe(0);
}

for (const { name, viewport } of LAYOUTS) {
	test.describe(`a failing next page on a ${name} screen`, () => {
		test.use({ viewport });

		for (const latencyMs of LATENCIES_MS) {
			test(`failing after ${latencyMs} ms, it backs off and waits for Retry`, async ({
				page,
			}) => {
				test.setTimeout(180_000);
				const scroller = await openFailingGrid({
					page,
					latencyMs,
					status: 503,
				});

				await scrollToBottom(scroller);
				const first = await nthRequest({ page, nth: 1 });
				await expectOneErrorAndNoToast(page);

				expect(
					await requestsWithin({
						page,
						since: first.at,
						ms: FIRST_RETRY_MS - MARGIN_MS,
					}),
					"requests before the first automatic retry",
				).toBe(1);

				const second = await nthRequest({ page, nth: 2 });
				expect(second.at - first.at).toBeGreaterThanOrEqual(
					FIRST_RETRY_MS,
				);
				await expectOneErrorAndNoToast(page);

				await stopFailing(page);
				const failedHeight = await scrollHeight(scroller);
				await retryButton(page).click();

				await expect
					.poll(() => scrollHeight(scroller), {
						timeout: SECOND_RETRY_MS - FIRST_RETRY_MS,
					})
					.toBeGreaterThan(failedHeight);
				expect(await retryButton(page).count()).toBe(0);
				expect(await page.locator(TOAST).count()).toBe(0);
			});
		}
	});
}

test("a pull-to-refresh lifts a failed next page", async ({ page }) => {
	test.setTimeout(180_000);
	const scroller = await openFailingGrid({
		page,
		latencyMs: 60,
		status: 400,
	});
	await scrollToBottom(scroller);
	const first = await nthRequest({ page, nth: 1 });
	await expectOneErrorAndNoToast(page);
	expect(
		await requestsWithin({
			page,
			since: first.at,
			ms: FIRST_RETRY_MS + MARGIN_MS,
		}),
	).toBe(1);
	await stopFailing(page);

	await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
	await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBe(0);
	const box = await page.locator(PROFILE_LINK).first().boundingBox();
	if (box === null) throw new Error("the grid shows no profile");
	await wheel(
		page,
		{ x: box.x + box.width / 2, y: box.y + box.height / 2 },
		-100,
	);
	await refreshButton(page).click();
	await expect(retryButton(page)).toHaveCount(0);

	const refreshedHeight = await scrollHeight(scroller);
	await scrollToBottom(scroller);

	await expect
		.poll(() => scrollHeight(scroller))
		.toBeGreaterThan(refreshedHeight);
	expect(await retryButton(page).count()).toBe(0);
});
