import { invoke } from "@tauri-apps/api/core";

import { currentPlatform } from "#lib/platform/os.ts";

let running = $state(false);

export function voiceOverRunning(): boolean {
	return running;
}

function watchIosVoiceOver(): void {
	let pushed = false;
	window.__iosVoiceOver = (on) => {
		pushed = true;
		running = on;
	};
	invoke<boolean>("voice_over_running").then(
		(on) => {
			if (!pushed) running = on === true;
		},
		(error: unknown) => {
			console.error("Failed to read whether VoiceOver is running", error);
		},
	);
}

export function installVoiceOverWatch(): void {
	switch (currentPlatform()) {
		case "ios":
			watchIosVoiceOver();
			return;
		case "android":
		case "linux":
		case "macos":
		case "windows":
			return;
	}
}
