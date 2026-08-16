import { callMethod } from "$lib/api/methods";
import { isMobilePlatform } from "$lib/platform/os";

class AppLifecycle {
	active = $state(true);
	#pending: Promise<void> | null = null;

	constructor() {
		if (typeof document === "undefined" || !isMobilePlatform()) return;
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "hidden") void this.deactivate();
			else void this.activate();
		});
	}

	activate(): Promise<void> {
		return this.#set(true);
	}

	deactivate(): Promise<void> {
		return this.#set(false);
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
}

export const appLifecycle = new AppLifecycle();
