import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { setRegionalSettings } from "#lib/i18n/index.ts";
import {
	parseRegionalOverride,
	type RegionalSettings,
	regionalSettingsSchema,
	webRegionalSettings,
} from "#lib/i18n/regional.ts";

export const NATIVE_READ_TIMEOUT_MS = 500;
export const NATIVE_READ_LIMIT_MS = 5000;

const CHANGED_EVENT = "regional-settings-changed";

let systemArrival: Promise<void> = Promise.resolve();
let systemArrivedInTime: Promise<boolean> = Promise.resolve(true);

function regionalOverride(): RegionalSettings | undefined {
	const value = new URLSearchParams(location.search).get("regional");
	return value === null ? undefined : parseRegionalOverride(value);
}

function nativeSettings(value: unknown): RegionalSettings | undefined {
	const parsed = regionalSettingsSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}

function settledWithin({
	promise,
	ms,
}: {
	promise: Promise<void>;
	ms: number;
}): Promise<boolean> {
	return Promise.race([
		promise.then(() => true),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
	]);
}

function followWebSettings(): void {
	setRegionalSettings(webRegionalSettings());
	window.addEventListener("languagechange", () =>
		setRegionalSettings(webRegionalSettings()),
	);
}

async function followNativeSettings(): Promise<void> {
	let changed = false;
	void listen<unknown>(CHANGED_EVENT, ({ payload }) => {
		const settings = nativeSettings(payload);
		if (settings === undefined) return;
		changed = true;
		setRegionalSettings(settings);
	}).catch(console.error);
	const initial = invoke("regional_settings")
		.then((value) => {
			const settings = nativeSettings(value);
			if (settings !== undefined && !changed)
				setRegionalSettings(settings);
		})
		.catch(console.error);
	systemArrival = initial;
	systemArrivedInTime = settledWithin({
		promise: initial,
		ms: NATIVE_READ_LIMIT_MS,
	});
	await settledWithin({ promise: initial, ms: NATIVE_READ_TIMEOUT_MS });
}

async function start(): Promise<void> {
	const pinned = import.meta.env.DEV ? regionalOverride() : undefined;
	if (pinned !== undefined) {
		setRegionalSettings(pinned);
	} else if (isTauri()) {
		await followNativeSettings();
	} else {
		followWebSettings();
	}
}

export function startRegionalSettings(): Promise<void> {
	systemArrival = Promise.resolve();
	systemArrivedInTime = Promise.resolve(true);
	return start();
}

export function regionalSettingsArrived(): Promise<void> {
	return systemArrival;
}

export function regionalSettingsArrivedInTime(): Promise<boolean> {
	return systemArrivedInTime;
}
