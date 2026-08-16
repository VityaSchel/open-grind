import { defineConfig, devices } from "@playwright/test";

declare const process: { getuid?: () => number };

const PORT = 5177;
// chromium refuses to sandbox as root, and the CI runner executes steps as root
const chromiumSandbox = process.getuid?.() !== 0;

export default defineConfig({
	testDir: "e2e",
	fullyParallel: false,
	workers: 1,
	retries: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
		...devices["Desktop Chrome"],
		actionTimeout: 30_000,
		viewport: { width: 420, height: 800 },
		hasTouch: true,
		launchOptions: { chromiumSandbox },
	},
	webServer: {
		command: `bunx vite dev --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: true,
		timeout: 120_000,
		env: { PUBLIC_ENABLE_DEMO: "1", PUBLIC_TEST_INSETS: "1" },
	},
});
