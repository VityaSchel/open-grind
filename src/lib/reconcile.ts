import { callMethod } from "$lib/api";
import { ws } from "$lib/ws.svelte";

const THROTTLE_MS = 2000;

export type ReconcileHandler = () => void | Promise<void>;

class Reconciler {
	#handlers = new Set<ReconcileHandler>();
	#lastReconcileAt = 0;
	#wasHidden = false;
	#firstConnect = true;

	constructor() {
		void ws.onConnected(() => {
			if (this.#firstConnect) {
				this.#firstConnect = false;
				return;
			}
			void this.#trigger();
		});

		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					this.#wasHidden = true;
					return;
				}
				if (!this.#wasHidden) return;
				this.#wasHidden = false;
				void this.#trigger();
			});
		}
	}

	subscribe(handler: ReconcileHandler): () => void {
		this.#handlers.add(handler);
		return () => {
			this.#handlers.delete(handler);
		};
	}

	async #trigger(): Promise<void> {
		const now = Date.now();
		if (now - this.#lastReconcileAt < THROTTLE_MS) return;
		this.#lastReconcileAt = now;

		const profileId = await callMethod("auth_state").catch(() => null);
		if (profileId === null) return;

		for (const handler of [...this.#handlers]) {
			try {
				await handler();
			} catch (error) {
				console.error("Reconcile handler failed", error);
			}
		}
	}
}

export const reconciler = new Reconciler();
