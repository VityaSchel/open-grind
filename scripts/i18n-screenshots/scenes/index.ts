import type { Page } from "@playwright/test";

import type { ScreenshotScene } from "../../../src/lib/demo/screenshot-scene";
import type { Platform } from "../manifest";
import type { NativeOverrides } from "../stubs";
import { albums } from "./albums";
import { onboarding, signIn } from "./auth";
import { chooseLocation, grid } from "./browse";
import { attachments, conversation, inbox, inboxPinFailure } from "./chat";
import { commandCenter } from "./command-center";
import {
	autoLocation,
	bypassFailure,
	bypassWithoutLocation,
	copyError,
	gridFailure,
	inboxFailure,
	networkBlocked,
	profileFailure,
	requestBlocked,
} from "./feedback";
import { emptyTaps } from "./interest";
import { profile } from "./profile";
import {
	accountStatus,
	sessionAlerts,
	sessionTryAgain,
	signInFailures,
	storagePlainFile,
	storageUnavailable,
} from "./session";
import {
	accountSettings,
	appSettings,
	meSettings,
	profileSettings,
} from "./settings";
import {
	blockIgnored,
	deleteConversations,
	errorPage,
	loadingFilters,
	notFound,
	pullHints,
	refreshButton,
	releaseHint,
	saveChanges,
	scrollToTop,
	signOutConfirm,
} from "./shell";
import { downloadToast, upToDateToast } from "./updates";

export type SceneView = {
	id: string;
	drive: (page: Page) => Promise<void>;
	scroller?: string;
	survivesLocaleSwitch?: boolean;
};

export type Scene = {
	platform: Platform;
	shim?: "linux" | "windows" | "ios";
	native?: NativeOverrides;
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
	requestBlocked,
	networkBlocked,
	copyError,
	inboxFailure,
	gridFailure,
	profileFailure,
	bypassWithoutLocation,
	bypassFailure,
	autoLocation,
	sessionAlerts,
	sessionTryAgain,
	accountStatus,
	signInFailures,
	storageUnavailable,
	storagePlainFile,
	notFound,
	errorPage,
	saveChanges,
	scrollToTop,
	refreshButton,
	pullHints,
	releaseHint,
	loadingFilters,
	signOutConfirm,
	deleteConversations,
	blockIgnored,
];
