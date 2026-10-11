import { test } from "@playwright/test";

import { expectPhotosToRestWithoutNeighbors } from "./support/carousel-seam";

test.describe.configure({ timeout: 300_000 });

test.use({ viewport: { width: 800, height: 701 }, deviceScaleFactor: 1 });

test("every profile photo rests without a pixel row of its neighbors in a short desktop window", async ({
	page,
}) => {
	await expectPhotosToRestWithoutNeighbors(page, { devicePixelRatio: 1 });
});
