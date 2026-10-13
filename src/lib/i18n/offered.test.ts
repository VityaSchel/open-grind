import { afterEach, describe, expect, it, vi } from "vitest";

import { PSEUDO_LOCALES } from "./pseudo";
import { parseLocalePath, SOURCE_LOCALE } from "./syntax";

vi.mock("./shipped-files", () => ({
	shippedFiles: {
		"./locales/de/common.json": () =>
			Promise.resolve({ actions: { close: "Schließen" } }),
	},
}));

const directories = [
	...new Set(
		Object.keys(import.meta.glob("./locales/*/*.json")).map(
			(path) => parseLocalePath(path).locale,
		),
	),
];

async function buildWith({
	dev,
	demo = false,
	screenshots = false,
}: {
	dev: boolean;
	demo?: boolean;
	screenshots?: boolean;
}) {
	vi.stubEnv("DEV", dev);
	if (demo) vi.stubEnv("OPEN_GRIND_DEMO", "1");
	if (screenshots) vi.stubEnv("OPEN_GRIND_SCREENSHOTS", "1");
	vi.resetModules();
	return import("./index");
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("offered languages", () => {
	it("are every directory and the pseudo-locales in dev builds", async () => {
		const { locales } = await buildWith({ dev: true });
		expect(directories).toEqual(
			expect.arrayContaining(["en", "es-419", "pt-PT", "zh-Hant"]),
		);
		expect([...locales].sort()).toEqual(
			[...directories, ...PSEUDO_LOCALES].sort(),
		);
	});

	it("are every directory and the pseudo-locales in screenshot builds", async () => {
		const { locales } = await buildWith({
			dev: false,
			demo: true,
			screenshots: true,
		});
		expect([...locales].sort()).toEqual(
			[...directories, ...PSEUDO_LOCALES].sort(),
		);
	});

	it.each([
		{ build: "release", demo: false },
		{ build: "web demo", demo: true },
	])("are English and shipped.json in $build builds", async ({ demo }) => {
		const { locales } = await buildWith({ dev: false, demo });
		expect(locales).toEqual(["de", SOURCE_LOCALE]);
	});

	it("match and load only shipped catalogs in release builds", async () => {
		const release = await buildWith({ dev: false });
		await release.setLocale({ locale: "de-AT" });
		expect(release.getLocale()).toBe("de-AT");
		expect(release.getCatalogLocale()).toBe("de");
		expect(release.t("common.actions.close")).toBe("Schließen");
		for (const locale of ["fr", "es-MX", "zh-TW"]) {
			await expect(release.setLocale({ locale })).rejects.toThrow(
				RangeError,
			);
		}
	});

	it("load unshipped catalogs in dev builds", async () => {
		const dev = await buildWith({ dev: true });
		await dev.setLocale({ locale: "fr-CA" });
		expect(dev.getCatalogLocale()).toBe("fr");
	});
});
