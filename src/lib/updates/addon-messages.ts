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

export type AddonErrorName =
	| "externallyManaged"
	| "foreignSigner"
	| "foreignTarget"
	| "noReleaseArtifacts"
	| "undetermined"
	| "downloadFailed"
	| "verifyFailed"
	| "saveDownloadFailed"
	| "installFailed"
	| "updateFailed"
	| "noStorageToInstall"
	| "noStorageToUpdate"
	| "busy"
	| "noRelease";

type AddonMessages = {
	readonly stage: Readonly<
		Record<Release["kind"], Readonly<Record<UpdateStage, PlainMessageKey>>>
	>;
	readonly installed: PlainMessageKey;
	readonly installedVersion: VersionMessageKey;
	readonly updated: PlainMessageKey;
	readonly updatedVersion: VersionMessageKey;
	readonly upToDate: PlainMessageKey;
	readonly errors: Readonly<Record<AddonErrorName, PlainMessageKey>>;
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
		errors: {
			externallyManaged:
				"updates.addons.googleOauth.errors.externallyManaged",
			foreignSigner: "updates.addons.googleOauth.errors.foreignSigner",
			foreignTarget: "updates.addons.googleOauth.errors.foreignTarget",
			noReleaseArtifacts:
				"updates.addons.googleOauth.errors.noReleaseArtifacts",
			undetermined: "updates.addons.googleOauth.errors.undetermined",
			downloadFailed: "updates.addons.googleOauth.errors.downloadFailed",
			verifyFailed: "updates.addons.googleOauth.errors.verifyFailed",
			saveDownloadFailed:
				"updates.addons.googleOauth.errors.saveDownloadFailed",
			installFailed: "updates.addons.googleOauth.errors.installFailed",
			updateFailed: "updates.addons.googleOauth.errors.updateFailed",
			noStorageToInstall:
				"updates.addons.googleOauth.errors.noStorageToInstall",
			noStorageToUpdate:
				"updates.addons.googleOauth.errors.noStorageToUpdate",
			busy: "updates.addons.googleOauth.errors.busy",
			noRelease: "updates.addons.googleOauth.errors.noRelease",
		},
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
		errors: {
			externallyManaged:
				"updates.addons.recaptcha.errors.externallyManaged",
			foreignSigner: "updates.addons.recaptcha.errors.foreignSigner",
			foreignTarget: "updates.addons.recaptcha.errors.foreignTarget",
			noReleaseArtifacts:
				"updates.addons.recaptcha.errors.noReleaseArtifacts",
			undetermined: "updates.addons.recaptcha.errors.undetermined",
			downloadFailed: "updates.addons.recaptcha.errors.downloadFailed",
			verifyFailed: "updates.addons.recaptcha.errors.verifyFailed",
			saveDownloadFailed:
				"updates.addons.recaptcha.errors.saveDownloadFailed",
			installFailed: "updates.addons.recaptcha.errors.installFailed",
			updateFailed: "updates.addons.recaptcha.errors.updateFailed",
			noStorageToInstall:
				"updates.addons.recaptcha.errors.noStorageToInstall",
			noStorageToUpdate:
				"updates.addons.recaptcha.errors.noStorageToUpdate",
			busy: "updates.addons.recaptcha.errors.busy",
			noRelease: "updates.addons.recaptcha.errors.noRelease",
		},
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
		errors: {
			externallyManaged: "updates.addons.fcm.errors.externallyManaged",
			foreignSigner: "updates.addons.fcm.errors.foreignSigner",
			foreignTarget: "updates.addons.fcm.errors.foreignTarget",
			noReleaseArtifacts: "updates.addons.fcm.errors.noReleaseArtifacts",
			undetermined: "updates.addons.fcm.errors.undetermined",
			downloadFailed: "updates.addons.fcm.errors.downloadFailed",
			verifyFailed: "updates.addons.fcm.errors.verifyFailed",
			saveDownloadFailed: "updates.addons.fcm.errors.saveDownloadFailed",
			installFailed: "updates.addons.fcm.errors.installFailed",
			updateFailed: "updates.addons.fcm.errors.updateFailed",
			noStorageToInstall: "updates.addons.fcm.errors.noStorageToInstall",
			noStorageToUpdate: "updates.addons.fcm.errors.noStorageToUpdate",
			busy: "updates.addons.fcm.errors.busy",
			noRelease: "updates.addons.fcm.errors.noRelease",
		},
	},
} as const satisfies Record<AddonKey, AddonMessages>;
