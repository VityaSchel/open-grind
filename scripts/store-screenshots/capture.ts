import { chromium } from "@playwright/test";

import playwrightConfig from "../../playwright.config";
import { forwardOnlyDevServerErrors, startDemoServer } from "./demo-server";
import { cropToDisplay, phoneDisplay } from "./display";
import { GPU_COMPOSITING_ON_SWIFTSHADER, requireGpuCompositing } from "./gpu";
import { launch, scenes } from "./scenes";
import { settle } from "./settle";

const SCREENSHOTS_DIR = Bun.fileURLToPath(
	new URL(
		"../../fastlane/metadata/android/en-US/images/phoneScreenshots/",
		import.meta.url,
	),
);
const STORE_IMAGES = "*.{png,jpg,jpeg}";
const APP_READY_TIMEOUT_MS = 120_000;

async function captureScenes(baseURL: string) {
	const launchOptions = playwrightConfig.use?.launchOptions;
	const browser = await chromium.launch({
		...launchOptions,
		args: [...(launchOptions?.args ?? []), GPU_COMPOSITING_ON_SWIFTSHADER],
	});
	try {
		await requireGpuCompositing(browser);
		const context = await browser.newContext({
			baseURL,
			...phoneDisplay,
			isMobile: true,
			hasTouch: true,
			reducedMotion: "reduce",
			colorScheme: "dark",
			locale: "en-US",
			timezoneId: "UTC",
		});
		context.setDefaultTimeout(APP_READY_TIMEOUT_MS);
		await forwardOnlyDevServerErrors({ context, baseURL });
		const page = await context.newPage();
		await launch(page);

		const captures: { file: string; image: Buffer }[] = [];
		for (const { file, open } of scenes) {
			await open(page);
			await settle(page);
			captures.push({ file, image: await page.screenshot() });
		}

		const cropper = await browser.newPage();
		return await Promise.all(
			captures.map(async ({ file, image }) => ({
				file,
				image: await cropToDisplay({ page: cropper, image }),
			})),
		);
	} finally {
		await browser.close();
	}
}

const server = await startDemoServer();
const captures = await captureScenes(server.baseURL).finally(server.stop);

for await (const stale of new Bun.Glob(STORE_IMAGES).scan(SCREENSHOTS_DIR)) {
	await Bun.file(`${SCREENSHOTS_DIR}${stale}`).delete();
}
for (const { file, image } of captures) {
	await Bun.write(`${SCREENSHOTS_DIR}${file}`, image);
	console.log(`${SCREENSHOTS_DIR}${file}`);
}
