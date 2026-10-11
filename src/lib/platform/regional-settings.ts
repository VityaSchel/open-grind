import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { setRegionalSettings } from "$lib/i18n";
import {
	parseRegionalOverride,
	type RegionalSettings,
	regionalSettingsSchema,
	webRegionalSettings,
} from "$lib/i18n/regional";

export const NATIVE_READ_TIMEOUT_MS = 500;
export const NATIVE_READ_LIMIT_MS = 5000;

const CHANGED_EVENT = "regional-settings-changed";

let systemRead: Promise<void> = Promise.resolve();

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
}): Promise<void> {
	return Promise.race([
		promise,
		new Promise<void>((resolve) => setTimeout(resolve, ms)),
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
	systemRead = settledWithin({ promise: initial, ms: NATIVE_READ_LIMIT_MS });
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
	systemRead = Promise.resolve();
	return start();
}

export function regionalSettingsReady(): Promise<void> {
	return systemRead;
}
