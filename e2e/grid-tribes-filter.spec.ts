import { expect, type Page, test } from "@playwright/test";

import { routeDemoThroughFaultHook } from "./support/demo-faults";
import { openBrowse } from "./support/profile-pager";

test.describe.configure({ timeout: 180_000 });

type CascadeWindow = Window & { __cascadeUrls: string[] };

async function recordCascadeRequests(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const urls: string[] = [];
		Object.assign(window, {
			__cascadeUrls: urls,
			__demoFault: ({ path }: { path: string }) => {
				if (new URL(path, location.origin).pathname === "/v4/cascade")
					urls.push(path);
				return undefined;
			},
		});
	});
	await routeDemoThroughFaultHook(page);
}

async function lastCascadeQuery(page: Page): Promise<URLSearchParams> {
	const urls = await page.evaluate(
		() => (window as unknown as CascadeWindow).__cascadeUrls,
	);
	return new URL(urls.at(-1) ?? "/", "https://app.test").searchParams;
}

test("the Their Tribes filter offers Trans while the session has no gender filter flag", async ({
	page,
}) => {
	await openBrowse(page);
	await page.getByRole("button", { name: "All filters" }).click();
	const filters = page.getByRole("dialog");
	await filters.getByRole("checkbox", { name: "Their Tribes" }).click();

	await expect(
		filters.getByRole("button", { name: "Bear", exact: true }),
	).toBeVisible();
	await expect(
		filters.getByRole("button", { name: "Trans", exact: true }),
	).toBeVisible();
});

test("the Tribes They're Into filter asks the grid for the tribes picked in it", async ({
	page,
}) => {
	await recordCascadeRequests(page);
	await openBrowse(page);
	await page.getByRole("button", { name: "All filters" }).click();
	const filters = page.getByRole("dialog");
	await filters
		.getByRole("checkbox", { name: "Tribes They're Into" })
		.click();
	await filters.getByRole("button", { name: "Otter", exact: true }).click();
	await filters.getByRole("button", { name: "Apply" }).click();

	await expect
		.poll(async () => (await lastCascadeQuery(page)).get("tribesImInto"))
		.toBe("8");
	expect((await lastCascadeQuery(page)).has("tribes")).toBe(false);
});
