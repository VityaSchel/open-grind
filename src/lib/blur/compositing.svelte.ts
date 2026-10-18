import { invoke, isTauri } from "@tauri-apps/api/core";

let renders = $state(true);
let engine = $state<string | null>(null);
let hydrated = $state(false);
let hydrating = false;

export async function hydrateBackdropCompositing(): Promise<void> {
	if (hydrating) return;
	hydrating = true;
	if (isTauri()) {
		const [rendersAnswer, engineAnswer] = await Promise.all([
			invoke("backdrop_filter_renders").catch(() => true),
			invoke("webview_engine").catch(() => null),
		]);
		renders = rendersAnswer !== false;
		engine = typeof engineAnswer === "string" ? engineAnswer : null;
	} else {
		engine = navigator.userAgent;
	}
	hydrated = true;
}

export function backdropCompositingRenders(): boolean {
	return renders;
}

export function webviewEngine(): string | null {
	return engine;
}

export function backdropCompositingHydrated(): boolean {
	return hydrated;
}
