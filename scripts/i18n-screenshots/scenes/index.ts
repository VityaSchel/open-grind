import type { Page } from "@playwright/test";

import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";

import { appSettings } from "./settings";

export type Platform = "phone" | "desktop";

export type Scene = {
	id: string;
	platform: Platform;
	demo?: Partial<ScreenshotScene>;
	open: (page: Page) => Promise<void>;
};

export const scenes: Scene[] = [appSettings];
