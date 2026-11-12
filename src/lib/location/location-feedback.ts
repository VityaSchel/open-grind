import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import {
	canOpenAppSettings,
	openAppSettings,
} from "#lib/platform/app-settings.ts";
import type {
	LocationErrorReason,
	LocationOutcome,
	MissingLocationGrant,
} from "./location-request.svelte";

const PERMISSION_TOAST_ID = "location-permission";

const DENIAL_COPY = {
	permission:
		"Location permission denied. Change this in your system settings to use GPS.",
	precision:
		"Precise Location is off. Turn it on in your system settings to use GPS.",
} as const satisfies Record<MissingLocationGrant, string>;

const LOCATION_DISABLED_COPY =
	"Location Services are off or restricted. Turn them on in your system settings to use GPS.";

export function showLocationPermissionToast({
	missing,
}: {
	missing: MissingLocationGrant;
}): void {
	toast.error(DENIAL_COPY[missing], {
		id: PERMISSION_TOAST_ID,
		...(canOpenAppSettings() && {
			action: { label: "Settings", onClick: openAppSettings },
		}),
	});
}

export function showLocationErrorToast({
	label,
	error,
	reason,
}: {
	label: string;
	error: unknown;
	reason: LocationErrorReason;
}): void {
	switch (reason) {
		case "disabled":
			toast.error(LOCATION_DISABLED_COPY, { id: PERMISSION_TOAST_ID });
			return;
		case "timeout":
		case "failed":
			showErrorToast({ label, error });
	}
}

export function reportLocationFailure(outcome: LocationOutcome): void {
	if (outcome.status === "denied") showLocationPermissionToast(outcome);
	if (outcome.status === "error") {
		console.error(outcome.error);
		showLocationErrorToast({
			label: "Failed to get current location",
			error: outcome.error,
			reason: outcome.reason,
		});
	}
}
