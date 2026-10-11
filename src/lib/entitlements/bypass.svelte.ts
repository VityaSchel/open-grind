import { toast } from "svelte-sonner";

import { registerAccountCache } from "$lib/api/account-caches";
import { showErrorToast } from "$lib/api/error-toast";
import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { type PlainMessageKey, t } from "$lib/i18n";
import { holdInHonduras, type LocationLease } from "./honduras-hold";

type BypassRequest = {
	reason: PlainMessageKey;
	answer: (lease: LocationLease | null) => void;
};

const TOAST_ID = "entitlement-bypass";

export const entitlementBypassState = $state<{
	open: boolean;
	reason: PlainMessageKey | null;
	busy: boolean;
}>({ open: false, reason: null, busy: false });

let requests: BypassRequest[] = [];

function syncPromptToQueue(): void {
	const oldest = requests[0];
	if (oldest) entitlementBypassState.reason = oldest.reason;
	entitlementBypassState.open = oldest !== undefined;
}

function reportBypassFailure({
	step,
	error,
}: {
	step: string;
	error: unknown;
}): void {
	console.error(`Entitlement bypass failed: ${step}`, error);
	showErrorToast({
		label: t("feedback.entitlementBypass.errors.bypassFailed"),
		error,
		id: TOAST_ID,
	});
}

export function reportRefusedDespiteBypass(error: unknown): void {
	reportBypassFailure({ step: "the action was still refused", error });
}

export function offerEntitlementBypass({
	reason,
}: {
	reason: PlainMessageKey;
}): Promise<LocationLease | null> {
	return new Promise((answer) => {
		requests.push({ reason, answer });
		if (!entitlementBypassState.open) syncPromptToQueue();
	});
}

export function dismissEntitlementBypass(): void {
	const declined = requests;
	requests = [];
	entitlementBypassState.open = false;
	for (const { answer } of declined) answer(null);
}

async function grantLeases({
	batch,
	home,
}: {
	batch: BypassRequest[];
	home: string;
}): Promise<void> {
	if (batch.length === 0) return;
	const hold = await holdInHonduras({ home }).catch((error: unknown) => {
		reportBypassFailure({ step: "could not complete the handover", error });
		return null;
	});
	for (const { answer } of batch) answer(hold?.lease() ?? null);
	await hold?.ended;
}

export async function runEntitlementBypass(): Promise<void> {
	if (entitlementBypassState.busy) return;
	const home = preferencesSnapshot().geohash;
	if (home === null) {
		dismissEntitlementBypass();
		toast.error(t("feedback.entitlementBypass.needsLocation"), {
			id: TOAST_ID,
		});
		return;
	}
	const batch = requests;
	requests = [];
	entitlementBypassState.busy = true;
	try {
		await grantLeases({ batch, home });
	} finally {
		entitlementBypassState.busy = false;
		syncPromptToQueue();
	}
}

registerAccountCache({ reset: dismissEntitlementBypass });
