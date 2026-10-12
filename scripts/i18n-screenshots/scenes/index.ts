import type { Page } from "@playwright/test";

import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";
import type { Platform } from "../manifest";
import { appSettings } from "./settings";

export type SceneView = {
	id: string;
	drive: (page: Page) => Promise<void>;
	scroller?: string;
	survivesLocaleSwitch?: boolean;
};

export type Scene = {
	platform: Platform;
	demo?: Partial<ScreenshotScene>;
	views: [SceneView, ...SceneView[]];
};

export const scenes: Scene[] = [appSettings];
