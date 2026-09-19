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

export type AddonActivity = Readonly<Activity>;

type AddonRuntime = { flow: UpdateFlow; activity: AddonActivity };

export function addonInstallerAvailable(): boolean {
	return (
		updatesAvailableHere() &&
		isAndroidPlatform() &&
		buildSignedByOpenGrind()
	);
}

export async function addonPublishedHere(
	component: AddonKey = GOOGLE_OAUTH_COMPONENT,
): Promise<boolean> {
	const readiness = await getUpdateReadiness(component).catch(() => null);
	return !(
		readiness?.state === "unsupported" &&
		readiness.detail.reason === "noReleaseArtifacts"
	);
}

function observed(
	presenter: StagePresenter,
	activity: Activity,
): StagePresenter {
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
		},
	};
}

const runtimes: Partial<Record<AddonKey, AddonRuntime>> = {};

function runtimeOf(component: AddonKey): AddonRuntime {
	const existing = runtimes[component];
	if (existing) return existing;

	const activity = $state<Activity>({ stage: null, installs: 0 });
	const runtime = {
		flow: new UpdateFlow({
			component,
			presenter: observed(toastPresenter(component), activity),
		}),
		activity: {
			get stage() {
				return activity.stage;
			},
			get installs() {
				return activity.installs;
			},
		},
	};
	runtimes[component] = runtime;
	return runtime;
}

export function addonFlow(component: AddonKey): UpdateFlow {
	return runtimeOf(component).flow;
}

export function addonActivityOf(component: AddonKey): AddonActivity {
	return runtimeOf(component).activity;
}

export const addonUpdates = addonFlow(GOOGLE_OAUTH_COMPONENT);
export const addonActivity = addonActivityOf(GOOGLE_OAUTH_COMPONENT);
export const recaptchaUpdates = addonFlow(RECAPTCHA_COMPONENT);

export const addonFlows: readonly UpdateFlow[] = ADDON_KEYS.map(addonFlow);

export async function startAddonUpdateWatch(): Promise<void> {
	if (!addonInstallerAvailable()) return;
	await Promise.all(addonFlows.map((flow) => flow.start()));
}
