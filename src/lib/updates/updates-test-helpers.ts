import { vi } from "vitest";

import {
	APP_COMPONENT,
	COMPONENT_KEYS,
	COMPONENT_PACKAGE,
	type ComponentKey,
	GOOGLE_OAUTH_COMPONENT,
} from "./components";
import type { InstallKind, StagePresenter, UpdateFlow } from "./flow";
import type * as UpdateApi from "./index";
import type * as Toasts from "./toasts";
import type { CheckResult, InstallOutcome, Progress, Readiness } from "./types";

const PUBLISHED_TAG = "v1.2.0";

export async function settled(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

type TagOptions = { tag?: string };

export function ready(
	kind: InstallKind,
	{ tag = PUBLISHED_TAG }: TagOptions = {},
): Readiness {
	return {
		state: "ready",
		detail: { tag, version: tag.slice(1), kind, canInstallNow: true },
	};
}

export function awaitingPermission(
	kind: InstallKind,
	{ tag = PUBLISHED_TAG }: TagOptions = {},
): Readiness {
	return {
		state: "ready",
		detail: { tag, version: tag.slice(1), kind, canInstallNow: false },
	};
}

export function resumable(
	kind: InstallKind,
	{ tag = PUBLISHED_TAG }: TagOptions = {},
): Readiness {
	return { state: "resumable", detail: { tag, version: tag.slice(1), kind } };
}

function artifact(name: string) {
	return {
		name,
		url: `https://git.opengrind.org/releases/download/${name}`,
		uuid: name,
		size: 100,
	};
}

export function offer(
	kind: InstallKind,
	{
		tag = PUBLISHED_TAG,
		component = GOOGLE_OAUTH_COMPONENT,
	}: { tag?: string; component?: ComponentKey } = {},
): CheckResult {
	const version = tag.slice(1);
	const asset = `${component}-${version}.apk`;
	return {
		available: true,
		currentVersion: kind === "install" ? null : "1.1.0",
		release: {
			component,
			kind,
			tag,
			version,
			payload: artifact(asset),
			signature: artifact(`${asset}.minisig`),
		},
	};
}

export const upToDate: CheckResult = {
	available: false,
	currentVersion: "1.1.0",
	release: null,
};

export const unpublished: CheckResult = {
	available: false,
	currentVersion: null,
	release: null,
};

export function progressOf(
	component: ComponentKey,
	over: Partial<Progress> = {},
): Progress {
	return {
		component,
		kind: "update",
		tag: PUBLISHED_TAG,
		version: PUBLISHED_TAG.slice(1),
		phase: "downloading",
		received: 0,
		total: 100,
		...over,
	};
}

export function outcomeOf(
	component: ComponentKey,
	over: Partial<InstallOutcome> = {},
): InstallOutcome {
	return {
		packageName: COMPONENT_PACKAGE[component],
		succeeded: true,
		canceled: false,
		...over,
	};
}

function nothingStagedAnywhere(): Record<ComponentKey, Readiness> {
	return Object.fromEntries(
		COMPONENT_KEYS.map((key) => [key, { state: "nothingStaged" }]),
	) as Record<ComponentKey, Readiness>;
}

export function updateApiFake() {
	const progressListeners: Array<(progress: Progress) => void> = [];
	const outcomeListeners: Array<(outcome: InstallOutcome) => void> = [];
	const readiness = nothingStagedAnywhere();
	const api = {
		cancelUpdateDownload: vi.fn<typeof UpdateApi.cancelUpdateDownload>(),
		checkForUpdate: vi.fn<typeof UpdateApi.checkForUpdate>(),
		discardStagedUpdate: vi.fn<typeof UpdateApi.discardStagedUpdate>(),
		getInstalledVersion: vi.fn<typeof UpdateApi.getInstalledVersion>(),
		getUpdateProgress: vi.fn<typeof UpdateApi.getUpdateProgress>(),
		getUpdateReadiness: vi.fn<typeof UpdateApi.getUpdateReadiness>(),
		installPending: vi.fn<typeof UpdateApi.installPending>(),
		installUpdate: vi.fn<typeof UpdateApi.installUpdate>(),
		onInstallFinished: vi.fn<typeof UpdateApi.onInstallFinished>(),
		onUpdateProgress: vi.fn<typeof UpdateApi.onUpdateProgress>(),
		openInstallPermissionSettings:
			vi.fn<typeof UpdateApi.openInstallPermissionSettings>(),
		startUpdateDownload: vi.fn<typeof UpdateApi.startUpdateDownload>(),
		takeInstallOutcome: vi.fn<typeof UpdateApi.takeInstallOutcome>(),
		updatesAvailableHere: vi.fn<typeof UpdateApi.updatesAvailableHere>(),
	};

	function reset(): void {
		for (const stub of Object.values(api)) stub.mockReset();
		progressListeners.length = 0;
		outcomeListeners.length = 0;
		Object.assign(readiness, nothingStagedAnywhere());
		api.cancelUpdateDownload.mockResolvedValue(undefined);
		api.checkForUpdate.mockResolvedValue(upToDate);
		api.discardStagedUpdate.mockResolvedValue(undefined);
		api.getInstalledVersion.mockResolvedValue(null);
		api.getUpdateProgress.mockResolvedValue(null);
		api.getUpdateReadiness.mockImplementation((component = APP_COMPONENT) =>
			Promise.resolve(readiness[component]),
		);
		api.installPending.mockResolvedValue(false);
		api.installUpdate.mockResolvedValue(undefined);
		api.onInstallFinished.mockImplementation((listener) => {
			outcomeListeners.push(listener);
			return Promise.resolve(() => {});
		});
		api.onUpdateProgress.mockImplementation((listener) => {
			progressListeners.push(listener);
			return Promise.resolve(() => {});
		});
		api.openInstallPermissionSettings.mockResolvedValue(undefined);
		api.startUpdateDownload.mockImplementation(
			(component = APP_COMPONENT) =>
				Promise.resolve(progressOf(component)),
		);
		api.takeInstallOutcome.mockResolvedValue(null);
		api.updatesAvailableHere.mockReturnValue(true);
	}

	return {
		api,
		readiness,
		reset,
		emitProgress: (progress: Progress) => {
			for (const listener of progressListeners) listener(progress);
		},
		emitOutcome: (outcome: InstallOutcome) => {
			for (const listener of outcomeListeners) listener(outcome);
		},
	};
}

export function toastsFake() {
	return {
		dismissStage: vi.fn<typeof Toasts.dismissStage>(),
		showAddonInstalled: vi.fn<typeof Toasts.showAddonInstalled>(),
		showInstalled: vi.fn<typeof Toasts.showInstalled>(),
		showManualInstall: vi.fn<typeof Toasts.showManualInstall>(),
		showProblem: vi.fn<typeof Toasts.showProblem>(),
		showStage: vi.fn<typeof Toasts.showStage>(),
		showUpToDate: vi.fn<typeof Toasts.showUpToDate>(),
	};
}

export function recorder() {
	const events: string[] = [];
	let lastShow: Parameters<StagePresenter["show"]>[0] | null = null;
	const presenter: StagePresenter = {
		show: (stage) => {
			lastShow = stage;
			events.push(`show:${stage.view.stage}`);
		},
		dismiss: () => {
			events.push("dismiss");
			const dismissed = lastShow;
			queueMicrotask(() => dismissed?.onDismiss());
		},
		problem: (title) => events.push(`problem:${title}`),
		manualInstall: (body) => events.push(`manual:${body}`),
		installed: ({ tag, kind }) => events.push(`installed:${kind}:${tag}`),
		upToDate: () => events.push("upToDate"),
	};
	return {
		presenter,
		events,
		activate: () => lastShow?.onActivate(),
		shownKind: () => lastShow?.kind ?? null,
		swipe: () => lastShow?.onDismiss(),
		problems: () => events.filter((event) => event.startsWith("problem:")),
	};
}

export async function flowFor(component: ComponentKey) {
	const { UpdateFlow } = await import("./flow");
	const view = recorder();
	const flow: UpdateFlow = new UpdateFlow({
		component,
		presenter: view.presenter,
	});
	return { flow, view };
}
