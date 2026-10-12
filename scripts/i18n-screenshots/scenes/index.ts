import type { Page } from "@playwright/test";

import { appSettings } from "./settings";

export type Platform = "phone" | "desktop";

export type Scene = {
	id: string;
	platform: Platform;
	open: (page: Page) => Promise<void>;
};

export const scenes: Scene[] = [appSettings];
