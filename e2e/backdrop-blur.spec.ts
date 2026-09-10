import { expect, type Page, test } from "@playwright/test";

import { installTauriShim } from "./support/app";

const PINNED_QUALITY = "max";
const FIRST_ROUTE_COMPILE_MS = 120_000;

test.describe.configure({ timeout: 240_000 });

async function openWithBlurReady(page: Page, route: string) {
	await installTauriShim(page);
	await page.goto(route);
	await expect(page.locator("html")).toHaveAttribute(
		"data-backdrop-blur",
		PINNED_QUALITY,
		{ timeout: FIRST_ROUTE_COMPILE_MS },
	);
}

async function visibleLayerBlurs(page: Page) {
	return await page
		.locator(".pblur")
		.first()
		.evaluate((bar) =>
			[...bar.querySelectorAll(".pblur-layer")]
				.filter((layer) => getComputedStyle(layer).display !== "none")
				.map((layer) => getComputedStyle(layer).backdropFilter),
		);
}

async function setQuality(page: Page, quality: string) {
	await page.evaluate(
		(value) =>
			document.documentElement.setAttribute("data-backdrop-blur", value),
		quality,
	);
}

test("one root attribute drives every progressive blur mode", async ({
	page,
}) => {
	await openWithBlurReady(page, "/right-now");
	await expect(page.locator(".pblur-layer").first()).toBeAttached();

	expect(await visibleLayerBlurs(page)).toEqual([
		"blur(1px)",
		"blur(2px)",
		"blur(4px)",
		"blur(8px)",
		"blur(12px)",
		"blur(16px)",
		"blur(24px)",
		"blur(32px)",
		"blur(64px)",
	]);

	await setQuality(page, "medium");
	expect(await visibleLayerBlurs(page)).toEqual([
		"blur(1px)",
		"blur(4px)",
		"blur(10px)",
		"blur(28px)",
		"blur(64px)",
	]);

	await setQuality(page, "min");
	expect(await visibleLayerBlurs(page)).toEqual(["blur(32px)"]);
	const plane = page.locator(".pblur").first();
	const overhang = await plane.evaluate((band) => {
		const layer = band.querySelector<HTMLElement>(
			'.pblur-layer[data-pblur-layer="0"]',
		)!;
		const bandBox = band.getBoundingClientRect();
		const layerBox = layer.getBoundingClientRect();
		const inner =
			band.getAttribute("data-pblur-direction") === "bottomToTop"
				? { grown: bandBox.top - layerBox.top, probe: layerBox.top + 8 }
				: {
						grown: layerBox.bottom - bandBox.bottom,
						probe: layerBox.bottom - 8,
					};
		const hit = document.elementFromPoint(layerBox.left + 8, inner.probe);
		return { grown: Math.round(inner.grown), swallowsInput: hit === layer };
	});
	expect(overhang.grown).toBeGreaterThan(0);
	expect(overhang.swallowsInput).toBe(false);
	await expect(plane.locator(".pblur-bg")).toHaveCSS(
		"background-image",
		"none",
	);
	await expect(plane.locator(".pblur-scrim")).toHaveCSS(
		"background-color",
		"rgba(0, 0, 0, 0.55)",
	);

	await setQuality(page, "off");
	expect(await visibleLayerBlurs(page)).toEqual([]);
	await expect(page.locator(".pblur-scrim").first()).toHaveCSS(
		"display",
		"block",
	);
});

test("off replaces the blur on ordinary surfaces with a black wash", async ({
	page,
}) => {
	await openWithBlurReady(page, "/settings/profile");
	const surface = page.locator(".scrim").first();
	await expect(surface).toBeAttached();

	await expect(surface).toHaveCSS("backdrop-filter", "blur(8px)");
	await expect(surface).toHaveCSS("background-image", "none");

	await setQuality(page, "off");
	await expect(surface).toHaveCSS("backdrop-filter", "none");
	await expect(surface).toHaveCSS(
		"background-image",
		"linear-gradient(rgba(0, 0, 0, 0.45), rgba(0, 0, 0, 0.45))",
	);
});

test("the settings slider restyles the app without a reload", async ({
	page,
}) => {
	await openWithBlurReady(page, "/settings/app");

	const slider = page.getByRole("slider", { name: "Background blur" });
	await expect(slider).toHaveAttribute("aria-valuetext", "Full");
	await expect(slider).toHaveAttribute("aria-valuenow", "3");

	await slider.focus();
	await page.keyboard.press("ArrowLeft");

	await expect(slider).toHaveAttribute("aria-valuetext", "Medium");
	await expect(page.locator("html")).toHaveAttribute(
		"data-backdrop-blur",
		"medium",
	);
	expect(await visibleLayerBlurs(page)).toHaveLength(5);
});

test("every step label sits on its own thumb position", async ({ page }) => {
	await openWithBlurReady(page, "/settings/app");

	const slider = page.getByRole("slider", { name: "Background blur" });
	const lastStep = Number(await slider.getAttribute("aria-valuemax"));
	await slider.focus();
	for (let step = 0; step < lastStep; step += 1)
		await page.keyboard.press("ArrowLeft");

	const centerOf = (selector: string) =>
		page.evaluate((target) => {
			const root = document
				.querySelector('[data-slot="slider"]')!
				.getBoundingClientRect();
			const box = document.querySelector(target)!.getBoundingClientRect();
			return Math.round(box.left + box.width / 2 - root.left);
		}, selector);

	for (let step = 0; step <= lastStep; step += 1) {
		const thumb = await centerOf('[data-slot="slider-thumb"]');
		const label = await centerOf(
			`[data-slot="blur-step-label"]:nth-child(${step + 1})`,
		);
		expect(label, `label ${step} against its thumb`).toBe(thumb);
		if (step < lastStep) await page.keyboard.press("ArrowRight");
	}
});
