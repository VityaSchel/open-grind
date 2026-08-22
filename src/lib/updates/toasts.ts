import { getVersion } from "@tauri-apps/api/app";
import CheckCircleIcon from "phosphor-svelte/lib/CheckCircleIcon";
import FolderOpenIcon from "phosphor-svelte/lib/FolderOpenIcon";
import SealWarningIcon from "phosphor-svelte/lib/SealWarningIcon";
import { toast } from "svelte-sonner";

import { openExternalLink } from "$lib/platform/link-opener";
import type { StageView } from "./stage";
import ToastCard from "./ToastCard.svelte";
import UpdateToast from "./UpdateToast.svelte";

const PLACEMENT = { position: "top-center" } as const;
const CARD_CLASS = "update-toast rounded-2xl";
const RELEASES = "https://git.opengrind.org/open-grind/open-grind/releases/tag";
const STAGE_TOAST = "update";
const INSTALLED_TOAST = "update-installed";

export function showStage({
	view,
	onActivate,
	onCancel,
	onDismiss,
}: {
	view: StageView;
	onActivate: () => void;
	onCancel: () => void;
	onDismiss: () => void;
}): void {
	const offered = view.stage === "available" || view.stage === "paused";
	const actionable = offered || view.stage === "ready";
	toast.custom(UpdateToast, {
		...PLACEMENT,
		id: STAGE_TOAST,
		duration: Number.POSITIVE_INFINITY,
		dismissible: offered,
		class: CARD_CLASS,
		onDismiss,
		componentProps: {
			...view,
			onActivate: () => {
				if (actionable) onActivate();
			},
			onCancel,
		},
	});
}

export function dismissStage(): void {
	toast.dismiss(STAGE_TOAST);
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
			onActivate: () => openExternalLink(`${RELEASES}/${tag}`),
		},
	});
}
