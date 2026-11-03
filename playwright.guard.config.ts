import { defineConfig } from "@playwright/test";

import base, { BUILD_SERVER } from "./playwright.config";

export default defineConfig({
	...base,
	testIgnore: [],
	testMatch: "layout-guard.spec.ts",
	fullyParallel: true,
	webServer: BUILD_SERVER,
});
