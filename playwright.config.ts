import { defineConfig, devices } from "@playwright/test";

declare const process: {
	env: Record<string, string | undefined>;
	getuid?: () => number;
};

const DEV_PORT = 5177;
const BUILD_PORT = 5178;
// chromium refuses to sandbox as root, and the CI runner executes steps as root
const chromiumSandbox = process.getuid?.() !== 0;

export const DEV_SERVER_URL = `http://localhost:${DEV_PORT}`;

const DEMO_ENV = {
	OPEN_GRIND_DEMO: "1",
	PUBLIC_TEST_INSETS: "1",
	PUBLIC_BACKDROP_BLUR: "max",
};

export const DEV_SERVER = {
	command: `bunx vite dev --port ${DEV_PORT} --strictPort`,
	port: DEV_PORT,
	reuseExistingServer: true,
	timeout: 120_000,
	env: DEMO_ENV,
};

export const BUILD_SERVER = {
	command: `bunx vite build && bunx vite preview --port ${BUILD_PORT} --strictPort`,
	port: BUILD_PORT,
	reuseExistingServer: false,
	timeout: 600_000,
	env: DEMO_ENV,
};

export default defineConfig({
	testDir: "e2e",
	testIgnore: "layout-guard.spec.ts",
	fullyParallel: false,
	workers: process.env.CI ? 2 : 1,
	retries: 1,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${BUILD_PORT}`,
		trace: process.env.CI ? "off" : "retain-on-failure",
		...devices["Desktop Chrome"],
		actionTimeout: 30_000,
		viewport: { width: 420, height: 800 },
		hasTouch: true,
		launchOptions: { chromiumSandbox },
	},
	webServer: [BUILD_SERVER, DEV_SERVER],
});
