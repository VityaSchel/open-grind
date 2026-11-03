import type { SupportedPlatform } from "#lib/platform/os.ts";

const runtime = globalThis as {
	__TAURI_OS_PLUGIN_INTERNALS__?: { platform: string };
};

export function runningOn(platform: SupportedPlatform): void {
	runtime.__TAURI_OS_PLUGIN_INTERNALS__ = { platform };
}

export function resetPlatform(): void {
	delete runtime.__TAURI_OS_PLUGIN_INTERNALS__;
}
