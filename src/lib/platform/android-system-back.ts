import { addPluginListener } from "@tauri-apps/api/core";

import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import type { SystemBackAdapter } from "#lib/platform/system-back-gesture.svelte.ts";

export function applyBackGestureHandler() {
	window.__AndroidOnBackGesture = () => !runBackGestureHandlers();
}

export const androidSystemBack: SystemBackAdapter = {
	passesOver: [],
	install: () => {
		applyBackGestureHandler();
		addPluginListener(
			"app",
			"back-button",
			({ canGoBack }: { canGoBack: boolean }) => {
				if (runBackGestureHandlers()) return;
				if (window.navigation?.canGoBack ?? canGoBack) history.back();
				else window.__AndroidBack?.moveTaskToBack();
			},
		).catch((error: unknown) => {
			console.error("Failed to register back button listener", error);
		});
	},
	readProgress: () => window.__AndroidBack?.gestureProgress(),
	expose: ({ start, cancel }) => {
		window.__AndroidOnBackGestureStart = start;
		window.__AndroidOnBackGestureCancel = cancel;
	},
	arm: () => {},
};
