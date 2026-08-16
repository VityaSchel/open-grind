import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
import { callMethod } from "$lib/api/methods";
import { ws } from "$lib/ws.svelte";

const THROTTLE_MS = 2000;

export type ReconcileHandler = () => void | Promise<void>;

class Reconciler {
	#handlers = new Set<ReconcileHandler>();
	#lastReconcileAt = 0;
	#resyncTimer: ReturnType<typeof setTimeout> | null = null;
	#wasHidden = false;
	#firstConnect = true;

	constructor() {
		ws.onConnected(() => {
			if (this.#firstConnect) {
				this.#firstConnect = false;
				return;
			}
			void this.#trigger();
		}).catch((error) => console.error(error));

		ws.onEventsDropped((skipped) => {
			console.warn(`[ws] resyncing after ${skipped} dropped events`);
			this.#scheduleResync();
		}).catch((error) => console.error(error));

		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					this.#wasHidden = true;
					return;
				}
				if (!this.#wasHidden) return;
				this.#wasHidden = false;
				void appLifecycle.activate().then(() => this.#trigger());
			});
		}
	}

	subscribe(handler: ReconcileHandler): () => void {
		this.#handlers.add(handler);
		return () => {
			this.#handlers.delete(handler);
		};
	}

	#scheduleResync(): void {
		if (this.#resyncTimer !== null) return;
		const elapsed = Date.now() - this.#lastReconcileAt;
		const wait = Math.max(THROTTLE_MS - elapsed, 0);
		this.#resyncTimer = setTimeout(() => {
			this.#resyncTimer = null;
			void this.#trigger();
		}, wait);
	}

	async #trigger(): Promise<void> {
		const now = Date.now();
		if (now - this.#lastReconcileAt < THROTTLE_MS) return;
		this.#lastReconcileAt = now;

		const profileId = await callMethod("auth_state").catch(() => null);
		if (profileId === null) return;

		await Promise.all(
			[...this.#handlers].map(async (handler) => {
				try {
					await handler();
				} catch (error) {
					console.error("Reconcile handler failed", error);
				}
			}),
		);
	}
}

export const reconciler = new Reconciler();
