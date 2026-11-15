import type { Browser } from "@playwright/test";

export const GPU_COMPOSITING_ON_SWIFTSHADER = "--use-angle=swiftshader";

export async function requireGpuCompositing(browser: Browser): Promise<void> {
	const session = await browser.newBrowserCDPSession();
	const { gpu } = await session.send("SystemInfo.getInfo");
	await session.detach();
	const compositing = gpu.featureStatus?.gpu_compositing;
	if (compositing !== "enabled") {
		throw new Error(
			`Chromium composites in software (gpu_compositing: ${compositing}), which leaves backdrop blurs partly or wholly unblurred above a device scale factor of 1`,
		);
	}
}
