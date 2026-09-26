import { defineConfig } from "@playwright/test";
import { join } from "node:path";

import { keepPageSnapshotsOutOfFailureReports } from "./support/privacy";
import { liveStatePaths } from "./support/state";

keepPageSnapshotsOutOfFailureReports();

export default defineConfig({
	testDir: import.meta.dirname,
	testMatch: "**/*.live.ts",
	outputDir: join(liveStatePaths.dir, "results"),
	globalSetup: "./global-setup.ts",
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 180_000,
	expect: { timeout: 20_000 },
	reporter: [["line"]],
	use: {
		trace: "off",
		screenshot: "off",
		video: "off",
		actionTimeout: 30_000,
	},
	projects: [
		{ name: "device", testMatch: "**/device.live.ts" },
		{
			name: "gate",
			testMatch: "**/gate.live.ts",
			dependencies: ["device"],
		},
		{
			name: "flows",
			testIgnore: [
				"**/device.live.ts",
				"**/gate.live.ts",
				"**/sweep.live.ts",
			],
			dependencies: ["gate"],
		},
		{
			name: "sweep",
			testMatch: "**/sweep.live.ts",
			dependencies: ["gate"],
		},
	],
});
