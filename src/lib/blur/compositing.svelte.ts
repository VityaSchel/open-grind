import { invoke, isTauri } from "@tauri-apps/api/core";

let renders = $state(true);
let hydrated = false;

export async function hydrateBackdropCompositing(): Promise<void> {
	if (hydrated) return;
	hydrated = true;
	if (!isTauri()) return;
	const answer = await invoke("backdrop_filter_renders").catch(() => true);
	renders = answer !== false;
}

export function backdropCompositingRenders(): boolean {
	return renders;
}
