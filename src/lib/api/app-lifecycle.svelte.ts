import { invoke } from "@tauri-apps/api/core";

import { callMethod } from "#lib/api/methods.ts";
import { currentPlatform, isMobilePlatform } from "#lib/platform/os.ts";

class AppLifecycle {
	active = $state(true);
	#pending: Promise<void> | null = null;
	readonly #unfinished = new Set<Promise<unknown>>();

	constructor() {
		if (typeof document === "undefined") return;
		document.addEventListener("visibilitychange", () => {
			if (!isMobilePlatform()) return;
			if (document.visibilityState === "hidden")
				void this.#allowSuspensionAfter(this.deactivate());
			else void this.activate();
		});
	}

	activate(): Promise<void> {
		return this.#set(true);
	}

	deactivate(): Promise<void> {
		return this.#set(false);
	}

	finishBeforeSuspending(work: Promise<unknown>): void {
		this.#unfinished.add(work);
		const finished = () => this.#unfinished.delete(work);
		void work.then(finished, finished);
	}

	#set(active: boolean): Promise<void> {
		if (this.active === active) return this.#pending ?? Promise.resolve();
		this.active = active;
		this.#pending = callMethod("set_app_active", { active })
			.then(() => undefined)
			.catch((error: unknown) => {
				console.error("[lifecycle] set_app_active failed", error);
			})
			.finally(() => {
				this.#pending = null;
			});
		return this.#pending;
	}

	async #allowSuspensionAfter(deactivation: Promise<void>): Promise<void> {
		switch (currentPlatform()) {
			case "ios":
				await Promise.allSettled([deactivation, ...this.#unfinished]);
				await invoke("allow_suspension").catch((error: unknown) => {
					console.error("[lifecycle] allow_suspension failed", error);
				});
				return;
			case "android":
			case "linux":
			case "macos":
			case "windows":
				return;
		}
	}
}

export const appLifecycle = new AppLifecycle();
