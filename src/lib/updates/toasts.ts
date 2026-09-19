import { getVersion } from "@tauri-apps/api/app";
import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
import InfoIcon from "phosphor-svelte/lib/InfoIcon";
import SealWarningIcon from "phosphor-svelte/lib/SealWarningIcon";
import { toast } from "svelte-sonner";

import { openExternalLink } from "$lib/platform/link-opener";
import {
	ADDON_NAME,
	type AddonKey,
	APP_COMPONENT,
	type ComponentKey,
} from "./components";
import type { InstallKind } from "./flow";
import type { StageView } from "./stage";
import ToastCard from "./ToastCard.svelte";
import UpdateToast from "./UpdateToast.svelte";

const PLACEMENT = { position: "top-center" } as const;
const CARD_CLASS = "update-toast rounded-2xl";
const RELEASES: Record<ComponentKey, string> = {
	app: "https://git.opengrind.org/open-grind/open-grind/releases/tag",
	"google-oauth":
		"https://git.opengrind.org/open-grind/google-oauth-app/releases/tag",
	recaptcha:
		"https://git.opengrind.org/open-grind/recaptcha-helper/releases/tag",
	fcm: "https://git.opengrind.org/open-grind/fcm-service/releases/tag",
};
const INSTALLED_TOAST = "update-installed";
const CHECK_RESULT_TOAST = "update-check-result";

function stageToast(component: ComponentKey): string {
	return component === APP_COMPONENT ? "update" : `update:${component}`;
}

export function showStage({
	component = APP_COMPONENT,
	view,
	kind,
	onActivate,
	onCancel,
	onDismiss,
}: {
	component?: ComponentKey;
	view: StageView;
	kind: InstallKind;
	onActivate: () => void;
	onCancel: () => void;
	onDismiss: () => void;
}): void {
	const offered = view.stage === "available" || view.stage === "paused";
	const actionable = offered || view.stage === "ready";
	toast.custom(UpdateToast, {
		...PLACEMENT,
		id: stageToast(component),
		duration: Number.POSITIVE_INFINITY,
		dismissible: offered,
		class: CARD_CLASS,
		onDismiss,
		componentProps: {
			...view,
			component,
			kind,
			onActivate: () => {
				if (actionable) onActivate();
			},
			onCancel,
		},
	});
}

export function dismissStage(component: ComponentKey = APP_COMPONENT): void {
	toast.dismiss(stageToast(component));
}

export function showProblem({ title, body }: { title: string; body?: string }) {
	toast.custom(ToastCard, {
		...PLACEMENT,
		duration: 8000,
		class: CARD_CLASS,
		componentProps: { icon: SealWarningIcon, tone: "error", title, body },
	});
}

export function showManualInstall(body: string): void {
	toast.custom(ToastCard, {
		...PLACEMENT,
		duration: 30000,
		class: CARD_CLASS,
		componentProps: {
			icon: FolderOpenIcon,
			title: "The update is ready in Finder",
			body,
		},
	});
}

export async function showInstalled(): Promise<void> {
	const semver = await getVersion().catch(() => null);
	if (semver === null) return;
	const tag = `v${semver}`;
	toast.custom(ToastCard, {
		...PLACEMENT,
		id: INSTALLED_TOAST,
		duration: 8000,
		class: CARD_CLASS,
		componentProps: {
			icon: CheckCircleIcon,
			title: `Updated to ${tag}`,
			body: "Tap to see changelog",
			onActivate: () => openExternalLink(`${RELEASES.app}/${tag}`),
		},
	});
}

export function showAddonInstalled({
	component,
	tag,
	kind,
}: {
	component: AddonKey;
	tag: string | null;
	kind: InstallKind;
}): void {
	const addon = ADDON_NAME[component];
	const done = kind === "install" ? `${addon} installed` : `${addon} updated`;
	toast.custom(ToastCard, {
		...PLACEMENT,
		id: `${INSTALLED_TOAST}:${component}`,
		duration: 8000,
		class: CARD_CLASS,
		componentProps: {
			icon: CheckCircleIcon,
			title: tag ? `${done}: ${tag}` : done,
			body: tag ? "Tap to see changelog" : undefined,
			onActivate: tag
				? () => openExternalLink(`${RELEASES[component]}/${tag}`)
				: undefined,
		},
	});
}

function showCheckResult({
	icon,
	title,
}: {
	icon: typeof CheckCircleIcon;
	title: string;
}): void {
	toast.custom(ToastCard, {
		...PLACEMENT,
		id: CHECK_RESULT_TOAST,
		duration: 4000,
		class: CARD_CLASS,
		componentProps: { icon, title },
	});
}

export function showUpToDate(title: string): void {
	showCheckResult({ icon: CheckCircleIcon, title });
}

export function showNotice(title: string): void {
	showCheckResult({ icon: InfoIcon, title });
}
