import { expect, test } from "@playwright/test";

import {
	DEMO_CONVERSATION,
	DEMO_GEOHASH,
	installTauriShim,
} from "./support/app";
import { seedPreferences } from "./support/app-data";
import { answerDemoRequests } from "./support/demo-faults";

test("location sharing loads maps on demand and preserves the searched and panned pin across tabs and resizing", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const places = await answerDemoRequests(page, {
		pathPrefix: "/v3/places/search?",
		status: 200,
		body: {
			places: [
				{
					name: "Paris",
					address: "France",
					lat: 48.8566,
					lon: 2.3522,
					importance: 1,
				},
			],
		},
	});
	let tileRequests = 0;
	await page.route("https://tile.openstreetmap.org/**", (route) => {
		tileRequests++;
		return route.fulfill({
			contentType: "image/svg+xml",
			body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#ddd"/></svg>',
		});
	});
	await installTauriShim(page);
	await seedPreferences(page, { preferences: { geohash: DEMO_GEOHASH } });
	await page.goto(DEMO_CONVERSATION);
	await places.start();
	await page.getByRole("button", { name: "Add attachment" }).click();
	const location = page.getByRole("tab", { name: "Location", exact: true });
	const map = page.locator(".leaflet-container");
	const marker = map.locator(".leaflet-marker-icon");
	async function pinOffsetFromCenter() {
		const bounds = (await map.boundingBox())!;
		const pin = (await marker.boundingBox())!;
		return Math.max(
			Math.abs(pin.x + pin.width / 2 - bounds.x - bounds.width / 2),
			Math.abs(pin.y + pin.height - bounds.y - bounds.height / 2),
		);
	}
	await expect(
		page.getByRole("tab", { name: "Media", exact: true }),
	).toHaveAttribute("aria-selected", "true");
	await expect(map).toHaveCount(0);
	expect(tileRequests).toBe(0);
	for (let opening = 0; opening < 2; opening++) {
		await location.click();
		await expect(
			page.getByRole("tabpanel", { name: "Location", exact: true }),
		).toHaveAccessibleDescription(
			"Drag the map to place the pin on the location you want to share.",
		);
		await expect(map).toBeVisible();
		await expect
			.poll(async () => (await map.boundingBox())?.height ?? 0)
			.toBeGreaterThan(200);
		await expect(map.locator(".leaflet-tile-loaded").first()).toBeVisible();
		await expect(marker).toBeVisible();
		await expect.poll(pinOffsetFromCenter).toBeLessThan(3);
		if (opening === 0)
			await page.getByRole("tab", { name: "Media", exact: true }).click();
	}
	const initialBounds = (await map.boundingBox())!;
	await page.getByPlaceholder("Search places…").fill("Paris");
	const viewportWithSearchKeyboard = { width: 420, height: 500 };
	await page.setViewportSize(viewportWithSearchKeyboard);
	await page.getByRole("button", { name: "Paris France" }).click();
	await expect.poll(pinOffsetFromCenter).toBeLessThan(3);
	await page.setViewportSize({ width: 420, height: 800 });
	await expect
		.poll(async () => {
			const bounds = (await map.boundingBox())!;
			return Math.abs(bounds.y - initialBounds.y);
		})
		.toBeLessThan(3);
	const bounds = (await map.boundingBox())!;
	await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + 100);
	await page.mouse.down();
	await page.mouse.move(bounds.x + bounds.width / 2 - 60, bounds.y + 200, {
		steps: 12,
	});
	await page.mouse.up();
	await expect.poll(pinOffsetFromCenter).toBeLessThan(3);
	await page.getByRole("tab", { name: "Media", exact: true }).click();
	await expect(map).toHaveCount(0);
	await location.click();
	await expect(map).toBeVisible();
	await expect(marker).toBeVisible();
	const send = page.getByRole("button", {
		name: "Send location",
		exact: true,
	});
	await page.setViewportSize({ width: 420, height: 320 });
	await expect
		.poll(async () => (await map.boundingBox())?.height ?? 0)
		.toBeGreaterThanOrEqual(192);
	await page.getByPlaceholder("Search places…").click({ trial: true });
	await send.click({ trial: true });
	await page.setViewportSize({ width: 420, height: 800 });
	await expect
		.poll(async () => {
			const mapBounds = (await map.boundingBox())!;
			const button = (await send.boundingBox())!;
			return mapBounds.y + mapBounds.height - button.y;
		})
		.toBeLessThanOrEqual(0);
	await send.click();
	await expect(map).toHaveCount(0);
	const sentLocation = page.getByRole("link", { name: /Open map/ }).last();
	await expect(sentLocation).toBeVisible();
	const uri = (await sentLocation.getAttribute("href"))!;
	const params = new URL(uri).searchParams;
	const lat = Number(params.get("mlat"));
	const lon = Number(params.get("mlon"));
	expect(lat).not.toBeCloseTo(48.8566, 4);
	expect(lon).not.toBeCloseTo(2.3522, 4);
	expect(lat).toBeGreaterThan(48.84);
	expect(lat).toBeLessThan(48.87);
	expect(lon).toBeGreaterThan(2.34);
	expect(lon).toBeLessThan(2.37);
	await page.getByRole("button", { name: "Add attachment" }).click();
	await expect(marker).toBeVisible();
	await expect.poll(pinOffsetFromCenter).toBeLessThan(3);
	await send.click();
	await expect(map).toHaveCount(0);
	await expect(sentLocation).toHaveAttribute("href", /mlat=52\.5/);
	const resetLocation = new URL((await sentLocation.getAttribute("href"))!);
	expect(Number(resetLocation.searchParams.get("mlat"))).toBeCloseTo(
		52.52,
		2,
	);
	expect(Number(resetLocation.searchParams.get("mlon"))).toBeCloseTo(
		13.405,
		2,
	);
	await page.getByRole("button", { name: "Add attachment" }).click();
	await page.getByRole("tab", { name: "Media", exact: true }).click();
	await expect(map).toHaveCount(0);
});
