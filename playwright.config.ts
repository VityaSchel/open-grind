import { defineConfig, devices } from "@playwright/test";

const PORT = 5177;

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
		viewport: { width: 420, height: 800 },
		hasTouch: true,
	},
	webServer: {
		command: `bun run dev:web --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: true,
		timeout: 120_000,
		env: { PUBLIC_ENABLE_DEMO: "1", PUBLIC_TEST_INSETS: "1" },
	},
});
