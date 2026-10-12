import type { Page } from "@playwright/test";

import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";
import type { Platform } from "../manifest";
import { albums } from "./albums";
import { onboarding, signIn } from "./auth";
import { chooseLocation, grid } from "./browse";
import { attachments, conversation, inbox, inboxPinFailure } from "./chat";
import { commandCenter } from "./command-center";
import { emptyTaps } from "./interest";
import { profile } from "./profile";
import {
	accountSettings,
	appSettings,
	meSettings,
	profileSettings,
} from "./settings";
import { downloadToast, upToDateToast } from "./updates";

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

export const scenes: Scene[] = [
	signIn,
	onboarding,
	chooseLocation,
	grid,
	profile,
	conversation,
	attachments,
	inboxPinFailure,
	albums,
	meSettings,
	profileSettings,
	accountSettings,
	appSettings,
	emptyTaps,
	upToDateToast,
	downloadToast,
	inbox,
	commandCenter,
];
