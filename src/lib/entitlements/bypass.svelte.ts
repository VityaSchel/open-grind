import { toast } from "svelte-sonner";

import {
	accountEpoch,
	isAccountEpochCurrent,
	registerAccountCache,
} from "$lib/api/account-caches";
import { updateLocation } from "$lib/api/browse/location";
import { showErrorToast } from "$lib/api/error-toast";
import { callMethod } from "$lib/api/methods";
import { preferencesSnapshot } from "$lib/app-data/preferences.svelte";
import { ws } from "$lib/ws.svelte";
import { randomHondurasGeohash } from "./honduras";

type BlockedAction = { reason: string; retry: () => Promise<unknown> };

const STEP_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 15_000;

export const entitlementBypassState = $state<{
	open: boolean;
	reason: string;
	busy: boolean;
}>({ open: false, reason: "", busy: false });

let blocked: BlockedAction[] = [];
let granting: Promise<void> | null = null;
let active: Promise<void> | null = null;

async function withDeadline<T>({
	work,
	ms,
}: {
	work: () => Promise<T>;
	ms: number;
}): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work(),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error(`no answer after ${ms} ms`)),
					ms,
				);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

function syncPromptToQueue(): void {
	const oldest = blocked[0];
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
	showErrorToast({ label: "Failed to bypass this paid feature", error });
}

async function grantFromHonduras({ home }: { home: string }): Promise<void> {
	const geohash = randomHondurasGeohash();
	try {
		await withDeadline({
			work: async () => {
				await updateLocation({ geohash });
				await callMethod("refresh_token", { geohash });
			},
			ms: STEP_TIMEOUT_MS,
		});
	} finally {
		await withDeadline({
			work: () => updateLocation({ geohash: home }),
			ms: STEP_TIMEOUT_MS,
		}).catch((error: unknown) => {
			console.error("Could not move back from Honduras", error);
		});
	}
}

export function awaitEntitlementGrant(): Promise<void> {
	return granting ?? Promise.resolve();
}

export function offerEntitlementBypass(action: BlockedAction): void {
	blocked.push(action);
	if (entitlementBypassState.open) return;
	syncPromptToQueue();
}

export function dismissEntitlementBypass(): void {
	blocked = [];
	entitlementBypassState.open = false;
}

async function bypassAndRetry({
	actions,
	epoch,
	home,
}: {
	actions: BlockedAction[];
	epoch: number;
	home: string;
}): Promise<void> {
	const grant = grantFromHonduras({ home });
	granting = grant.catch(() => undefined);
	try {
		await grant;
	} finally {
		granting = null;
	}
	await ws.reconnect();
	if (!isAccountEpochCurrent(epoch)) return;
	const outcomes = await Promise.allSettled(
		actions.map(({ retry }) => retry()),
	);
	const failed = outcomes.find((outcome) => outcome.status === "rejected");
	if (failed) {
		reportBypassFailure({
			step: "the action was still refused",
			error: failed.reason,
		});
	}
}

async function startBypass({ home }: { home: string }): Promise<void> {
	const actions = blocked;
	blocked = [];
	try {
		await bypassAndRetry({ actions, epoch: accountEpoch(), home });
	} finally {
		active = null;
	}
}

export async function runEntitlementBypass(): Promise<void> {
	const home = preferencesSnapshot().geohash;
	if (home === null) {
		dismissEntitlementBypass();
		toast.error("Set your location before using this bypass", {
			id: "entitlement-bypass",
		});
		return;
	}
	const run = (active ??= startBypass({ home }));
	entitlementBypassState.busy = true;
	try {
		await withDeadline({ work: () => run, ms: RUN_TIMEOUT_MS });
	} catch (error) {
		reportBypassFailure({ step: "could not complete the handover", error });
	} finally {
		entitlementBypassState.busy = false;
		syncPromptToQueue();
	}
}

registerAccountCache({ reset: dismissEntitlementBypass });
