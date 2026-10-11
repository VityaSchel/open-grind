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

const CHANGED_EVENT = "regional-settings-changed";

function regionalOverride(): RegionalSettings | undefined {
	const value = new URLSearchParams(location.search).get("regional");
	return value === null ? undefined : parseRegionalOverride(value);
}

function nativeSettings(value: unknown): RegionalSettings | undefined {
	const parsed = regionalSettingsSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
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
	await Promise.race([
		initial,
		new Promise((resolve) => setTimeout(resolve, NATIVE_READ_TIMEOUT_MS)),
	]);
}

export async function startRegionalSettings(): Promise<void> {
	const pinned = import.meta.env.DEV ? regionalOverride() : undefined;
	if (pinned !== undefined) {
		setRegionalSettings(pinned);
	} else if (isTauri()) {
		await followNativeSettings();
	} else {
		followWebSettings();
	}
}
