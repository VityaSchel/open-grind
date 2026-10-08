import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import { t } from "$lib/i18n";
import {
	canOpenAppSettings,
	openAppSettings,
} from "$lib/platform/app-settings";
import type { LocationOutcome } from "./location-request.svelte";

const PERMISSION_TOAST_ID = "location-permission";

export function showLocationPermissionToast(): void {
	toast.error(t("browse.location.permissionDenied"), {
		id: PERMISSION_TOAST_ID,
		...(canOpenAppSettings() && {
			action: {
				label: t("browse.location.openSettings"),
				onClick: openAppSettings,
			},
		}),
	});
}

export function reportLocationFailure(outcome: LocationOutcome): void {
	if (outcome.status === "denied") showLocationPermissionToast();
	if (outcome.status === "error") {
		console.error(outcome.error);
		showErrorToast({
			label: t("browse.location.errors.locateFailed"),
			error: outcome.error,
		});
	}
}
