import { defineConfig } from "@playwright/test";

import base, { DEMO_ENV } from "./playwright.config";

const PORT = 5178;

export default defineConfig({
	...base,
	testIgnore: [],
	testMatch: "layout-guard.spec.ts",
	use: { ...base.use, baseURL: `http://localhost:${PORT}` },
	webServer: {
		command: `bunx vite build && bunx vite preview --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 600_000,
		env: DEMO_ENV,
	},
});
