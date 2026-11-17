import { toast } from "svelte-sonner";

import { showErrorToast } from "#lib/api/error-toast.ts";
import { type PlainMessageKey, t } from "#lib/i18n/index.ts";
import {
	canOpenAppSettings,
	openAppSettings,
} from "#lib/platform/app-settings.ts";
import type {
	LocationErrorReason,
	LocationOutcome,
	MissingLocationGrant,
} from "./location-request.svelte";

const GPS_BLOCKED_TOAST_ID = "gps-blocked";

const denialMessageKeys = {
	permission: "browse.location.permissionDenied",
	precision: "browse.location.preciseLocationOff",
} as const satisfies Record<MissingLocationGrant, PlainMessageKey>;

function showLocationPermissionToast({
	missing,
}: {
	missing: MissingLocationGrant;
}): void {
	toast.error(t(denialMessageKeys[missing]), {
		id: GPS_BLOCKED_TOAST_ID,
		...(canOpenAppSettings() && {
			action: {
				label: t("browse.location.openSettings"),
				onClick: openAppSettings,
			},
		}),
	});
}

function showLocationErrorToast({
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
			toast.error(t("browse.location.locationServicesOff"), {
				id: GPS_BLOCKED_TOAST_ID,
			});
			return;
		case "failed":
			showErrorToast({ label, error });
	}
}

export function reportLocationFailure(
	outcome: LocationOutcome,
	{
		label = t("browse.location.errors.locateFailed"),
	}: { label?: string } = {},
): void {
	if (outcome.status === "denied") showLocationPermissionToast(outcome);
	if (outcome.status === "error") {
		console.error(outcome.error);
		showLocationErrorToast({
			label,
			error: outcome.error,
			reason: outcome.reason,
		});
	}
}
