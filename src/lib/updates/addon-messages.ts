import type { MessageKeyWith, PlainMessageKey } from "$lib/i18n";
import {
	type AddonKey,
	FCM_COMPONENT,
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
} from "./components";
import type { UpdateStage } from "./stage";
import type { Release } from "./types";

type VersionMessageKey = MessageKeyWith<{ tag: string }>;

type AddonMessages = {
	readonly stage: Readonly<
		Record<Release["kind"], Readonly<Record<UpdateStage, PlainMessageKey>>>
	>;
	readonly installed: PlainMessageKey;
	readonly installedVersion: VersionMessageKey;
	readonly updated: PlainMessageKey;
	readonly updatedVersion: VersionMessageKey;
	readonly upToDate: PlainMessageKey;
};

export const ADDON_MESSAGES = {
	[GOOGLE_OAUTH_COMPONENT]: {
		stage: {
			install: {
				available: "updates.addons.googleOauth.stage.install.available",
				downloading:
					"updates.addons.googleOauth.stage.install.downloading",
				verifying: "updates.addons.googleOauth.stage.install.verifying",
				paused: "updates.addons.googleOauth.stage.install.paused",
				ready: "updates.addons.googleOauth.stage.install.ready",
				installing:
					"updates.addons.googleOauth.stage.install.installing",
			},
			update: {
				available: "updates.addons.googleOauth.stage.update.available",
				downloading:
					"updates.addons.googleOauth.stage.update.downloading",
				verifying: "updates.addons.googleOauth.stage.update.verifying",
				paused: "updates.addons.googleOauth.stage.update.paused",
				ready: "updates.addons.googleOauth.stage.update.ready",
				installing:
					"updates.addons.googleOauth.stage.update.installing",
			},
		},
		installed: "updates.addons.googleOauth.installed",
		installedVersion: "updates.addons.googleOauth.installedVersion",
		updated: "updates.addons.googleOauth.updated",
		updatedVersion: "updates.addons.googleOauth.updatedVersion",
		upToDate: "updates.addons.googleOauth.upToDate",
	},
	[RECAPTCHA_COMPONENT]: {
		stage: {
			install: {
				available: "updates.addons.recaptcha.stage.install.available",
				downloading:
					"updates.addons.recaptcha.stage.install.downloading",
				verifying: "updates.addons.recaptcha.stage.install.verifying",
				paused: "updates.addons.recaptcha.stage.install.paused",
				ready: "updates.addons.recaptcha.stage.install.ready",
				installing: "updates.addons.recaptcha.stage.install.installing",
			},
			update: {
				available: "updates.addons.recaptcha.stage.update.available",
				downloading:
					"updates.addons.recaptcha.stage.update.downloading",
				verifying: "updates.addons.recaptcha.stage.update.verifying",
				paused: "updates.addons.recaptcha.stage.update.paused",
				ready: "updates.addons.recaptcha.stage.update.ready",
				installing: "updates.addons.recaptcha.stage.update.installing",
			},
		},
		installed: "updates.addons.recaptcha.installed",
		installedVersion: "updates.addons.recaptcha.installedVersion",
		updated: "updates.addons.recaptcha.updated",
		updatedVersion: "updates.addons.recaptcha.updatedVersion",
		upToDate: "updates.addons.recaptcha.upToDate",
	},
	[FCM_COMPONENT]: {
		stage: {
			install: {
				available: "updates.addons.fcm.stage.install.available",
				downloading: "updates.addons.fcm.stage.install.downloading",
				verifying: "updates.addons.fcm.stage.install.verifying",
				paused: "updates.addons.fcm.stage.install.paused",
				ready: "updates.addons.fcm.stage.install.ready",
				installing: "updates.addons.fcm.stage.install.installing",
			},
			update: {
				available: "updates.addons.fcm.stage.update.available",
				downloading: "updates.addons.fcm.stage.update.downloading",
				verifying: "updates.addons.fcm.stage.update.verifying",
				paused: "updates.addons.fcm.stage.update.paused",
				ready: "updates.addons.fcm.stage.update.ready",
				installing: "updates.addons.fcm.stage.update.installing",
			},
		},
		installed: "updates.addons.fcm.installed",
		installedVersion: "updates.addons.fcm.installedVersion",
		updated: "updates.addons.fcm.updated",
		updatedVersion: "updates.addons.fcm.updatedVersion",
		upToDate: "updates.addons.fcm.upToDate",
	},
} as const satisfies Record<AddonKey, AddonMessages>;
