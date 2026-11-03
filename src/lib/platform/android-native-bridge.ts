import { addPluginListener } from "@tauri-apps/api/core";

import { runBackGestureHandlers } from "#lib/platform/back-gesture-event.svelte.ts";
import type { SystemBackAdapter } from "#lib/platform/system-back-gesture.ts";

export function applyBackGestureHandler() {
	window.__AndroidOnBackGesture = () => !runBackGestureHandlers();
}

async function registerAndroidBackButtonListener() {
	await addPluginListener(
		"app",
		"back-button",
		({ canGoBack }: { canGoBack: boolean }) => {
			if (runBackGestureHandlers()) return;
			if (window.navigation?.canGoBack ?? canGoBack) history.back();
			else window.__AndroidBack?.moveTaskToBack();
		},
	);
}

export const androidSystemBack: SystemBackAdapter = {
	install: () => {
		applyBackGestureHandler();
		void registerAndroidBackButtonListener().catch((error) => {
			console.error("Failed to register back button listener", error);
		});
	},
	readProgress: () => window.__AndroidBack?.gestureProgress(),
	expose: ({ start, cancel }) => {
		window.__AndroidOnBackGestureStart = start;
		window.__AndroidOnBackGestureCancel = cancel;
		return () => {
			if (window.__AndroidOnBackGestureStart === start)
				delete window.__AndroidOnBackGestureStart;
			if (window.__AndroidOnBackGestureCancel === cancel)
				delete window.__AndroidOnBackGestureCancel;
		};
	},
};
