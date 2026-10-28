import { expect, test } from "@playwright/test";

import { installTauriShim } from "./support/app";
import { type Keyboard, sendInsets } from "./support/keyboard";
import {
	BLUR_MODES,
	scanLayout,
	scrollsMovedByBarInput,
	seeThroughDepth,
	setBlurMode,
	settle,
	structureViolations,
} from "./support/layout-guard";
import { SURFACES } from "./support/surfaces";

const SCREENS: {
	name: string;
	viewport: { width: number; height: number };
	insets?: Keyboard["insets"];
}[] = [
	{ name: "a 412 × 923 phone", viewport: { width: 412, height: 923 } },
	{ name: "a 1280 × 800 desktop", viewport: { width: 1280, height: 800 } },
	{
		name: "an 874 × 402 iPhone in landscape",
		viewport: { width: 874, height: 402 },
		insets: { top: 0, bottom: 20, left: 62, right: 62, ime: false },
	},
	{
		name: "an 800 × 360 Android phone in landscape",
		viewport: { width: 800, height: 360 },
		insets: { top: 24, bottom: 0, left: 0, right: 48, ime: false },
	},
];

test.describe.configure({ timeout: 240_000 });

for (const screen of SCREENS) {
	test.describe(`on ${screen.name}`, () => {
		test.use({
			viewport: screen.viewport,
			deviceScaleFactor: 1,
			contextOptions: { reducedMotion: "reduce" },
		});

		for (const surface of SURFACES) {
			test(`${surface.name} fits the screen, keeps clear of the cutouts, keeps its bars still and see-through, and has a sound structure`, async ({
				page,
			}) => {
				await installTauriShim(page, { platform: "macos" });
				await page.goto(surface.path);
				await surface.ready(page);
				if (screen.insets) await sendInsets(page, screen.insets);
				await settle(page);

				const scan = await scanLayout(page);

				expect
					.soft(
						new Set(scan.bars.map((bar) => bar.edge)),
						"the screen's bars are marked",
					)
					.toEqual(new Set(Object.keys(surface.bars)));
				for (const bar of scan.bars) {
					if (surface.bars[bar.edge] !== "content") continue;
					expect
						.soft(
							bar.underneath?.name ?? null,
							`the page scrolls under ${bar.name}`,
						)
						.not.toBeNull();
				}

				expect
					.soft(
						scan.documentOverflow,
						"the document itself never scrolls",
					)
					.toEqual({ x: 0, y: 0 });
				expect
					.soft(scan.scrollersInBars, "nothing inside a bar scrolls")
					.toEqual([]);
				expect
					.soft(
						scan.unintendedSidewaysScrollers,
						"only marked scrollers scroll sideways",
					)
					.toEqual([]);
				expect
					.soft(scan.escapes, "nothing sticks out of the screen")
					.toEqual([]);
				expect
					.soft(
						scan.intoSideBands,
						"nothing visible reaches into a side cutout",
					)
					.toEqual([]);
				expect
					.soft(
						scan.fixedChromeShortOfTheEdges,
						"fixed bars paint from edge to edge",
					)
					.toEqual([]);

				for (const mode of BLUR_MODES) {
					await setBlurMode(page, mode);
					for (const bar of scan.bars) {
						if (!bar.underneath || bar.clearZone === 0) continue;
						expect
							.soft(
								await seeThroughDepth(page, { bar }),
								`with blur ${mode}, ${bar.underneath.name} shows through ${bar.name}`,
							)
							.toBeGreaterThanOrEqual(
								Math.floor(bar.clearZone / 2),
							);
					}
				}
				await setBlurMode(page, "max");

				expect
					.soft(await structureViolations(page), "structure rules")
					.toEqual([]);

				for (const bar of scan.bars) {
					expect
						.soft(
							await scrollsMovedByBarInput(page, { bar }),
							`dragging or wheeling on ${bar.name} scrolls nothing`,
						)
						.toEqual([]);
				}
			});
		}
	});
}
