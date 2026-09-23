import { isAndroidPlatform } from "$lib/platform/os";
import { buildSignedByOpenGrind } from "./capability.svelte";
import {
	ADDON_KEYS,
	type AddonKey,
	GOOGLE_OAUTH_COMPONENT,
	RECAPTCHA_COMPONENT,
} from "./components";
import { type StagePresenter, UpdateFlow } from "./flow";
import { getUpdateReadiness, updatesAvailableHere } from "./index";
import type { UpdateStage } from "./stage";
import { toastPresenter } from "./toast-presenter";

type Activity = { stage: UpdateStage | null; installs: number };

type AddonActivity = Readonly<Activity>;

type InstallListener = () => Promise<void>;

type AddonRuntime = {
	flow: UpdateFlow;
	activity: AddonActivity;
	installListeners: Set<InstallListener>;
};

export function addonInstallerAvailable(): boolean {
	return (
		updatesAvailableHere() &&
		isAndroidPlatform() &&
		buildSignedByOpenGrind()
	);
}

export async function addonPublishedHere(): Promise<boolean> {
	const readiness = await getUpdateReadiness(GOOGLE_OAUTH_COMPONENT).catch(
		() => null,
	);
	return !(
		readiness?.state === "unsupported" &&
		readiness.detail.reason === "noReleaseArtifacts"
	);
}

function observed({
	presenter,
	activity,
	installListeners,
}: {
	presenter: StagePresenter;
	activity: Activity;
	installListeners: ReadonlySet<InstallListener>;
}): StagePresenter {
	let showing = 0;
	return {
		...presenter,
		show: (args) => {
			const shown = ++showing;
			activity.stage = args.view.stage;
			presenter.show({
				...args,
				onDismiss: () => {
					if (shown === showing) activity.stage = null;
					args.onDismiss();
				},
			});
		},
		dismiss: () => {
			showing++;
			activity.stage = null;
			presenter.dismiss();
		},
		installed: (args) => {
			activity.installs++;
			presenter.installed(args);
			for (const listener of installListeners) {
				listener().catch((error: unknown) => {
					console.error("Failed to follow an add-on install", error);
				});
			}
		},
	};
}

const runtimes: Partial<Record<AddonKey, AddonRuntime>> = {};

function runtimeOf(component: AddonKey): AddonRuntime {
	const existing = runtimes[component];
	if (existing) return existing;

	const activity = $state<Activity>({ stage: null, installs: 0 });
	const installListeners = new Set<InstallListener>();
	const runtime = {
		flow: new UpdateFlow({
			component,
			presenter: observed({
				presenter: toastPresenter(component),
				activity,
				installListeners,
			}),
		}),
		activity: {
			get stage() {
				return activity.stage;
			},
			get installs() {
				return activity.installs;
			},
		},
		installListeners,
	};
	runtimes[component] = runtime;
	return runtime;
}

export function addonFlow(component: AddonKey): UpdateFlow {
	return runtimeOf(component).flow;
}

export function onAddonInstalled({
	component,
	listener,
}: {
	component: AddonKey;
	listener: InstallListener;
}): void {
	runtimeOf(component).installListeners.add(listener);
}

export const addonUpdates = addonFlow(GOOGLE_OAUTH_COMPONENT);
export const addonActivity: AddonActivity = runtimeOf(
	GOOGLE_OAUTH_COMPONENT,
).activity;
export const recaptchaUpdates = addonFlow(RECAPTCHA_COMPONENT);

export const addonFlows: readonly UpdateFlow[] = ADDON_KEYS.map(addonFlow);

export async function startAddonUpdateWatch(): Promise<void> {
	if (!addonInstallerAvailable()) return;
	await Promise.all(addonFlows.map((flow) => flow.start()));
}
