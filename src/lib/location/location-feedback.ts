import { toast } from "svelte-sonner";

import { showErrorToast } from "$lib/api/error-toast";
import {
	canOpenAppSettings,
	openAppSettings,
} from "$lib/platform/app-settings";
import type { LocationOutcome } from "./location-request.svelte";

const PERMISSION_TOAST_ID = "location-permission";

export function showLocationPermissionToast(): void {
	toast.error(
		"Location permission denied. Change this in your system settings to use GPS.",
		{
			id: PERMISSION_TOAST_ID,
			...(canOpenAppSettings() && {
				action: { label: "Settings", onClick: openAppSettings },
			}),
		},
	);
}

export function reportLocationFailure(outcome: LocationOutcome): void {
	if (outcome.status === "denied") showLocationPermissionToast();
	if (outcome.status === "error") {
		console.error(outcome.error);
		showErrorToast({
			label: "Failed to get current location",
			error: outcome.error,
		});
	}
}
