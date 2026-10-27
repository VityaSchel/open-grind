import { invoke } from "@tauri-apps/api/core";

import { currentPlatform } from "./os";

type State = { available: boolean; installed: boolean };

const unavailable: State = { available: false, installed: false };

let state = $state<State>(unavailable);
let hydrated = false;

function desktopEntriesHere(): boolean {
	switch (currentPlatform()) {
		case "linux":
			return true;
		case "android":
		case "ios":
		case "macos":
		case "windows":
			return false;
	}
}

function toState(value: unknown): State {
	if (typeof value !== "object" || value === null) return unavailable;
	const { available, installed } = value as Partial<State>;
	return { available: available === true, installed: installed === true };
}

async function read(): Promise<State> {
	if (!desktopEntriesHere()) return unavailable;
	return toState(await invoke("desktop_entry_state").catch(() => null));
}

export async function hydrateDesktopEntryState(): Promise<void> {
	if (hydrated) return;
	hydrated = true;
	state = await read();
}

export function desktopEntryAvailable(): boolean {
	return state.available;
}

export function desktopEntryInstalled(): boolean {
	return state.installed;
}

export async function setDesktopEntryInstalled(
	installed: boolean,
): Promise<void> {
	if (!desktopEntriesHere()) return;
	await invoke(installed ? "desktop_entry_install" : "desktop_entry_remove");
	state = await read();
}
