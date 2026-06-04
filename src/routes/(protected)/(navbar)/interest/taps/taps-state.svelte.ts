import { showErrorToast } from "$lib/api/error";
import { getReceivedTaps } from "$lib/api/interest/taps";
import { ws } from "$lib/ws.svelte";
import type { TapProfile } from "$lib/model/interest/tap-profile";

export class TapsState {
	taps: TapProfile[] = $state([]);
	loading = $state(true);
	error: Error | null = $state(null);

	#initial: Promise<void>;
	#destroyed = false;
	#firstConnect = true;
	#wasHidden = false;
	#lastReconcileAt = 0;
	#unlistenConnected: Promise<() => void>;
	#removeVisibility: (() => void) | null = null;

	constructor() {
		this.#initial = this.#initialLoad();

		this.#unlistenConnected = ws.onConnected(() => {
			if (this.#destroyed) return;
			if (this.#firstConnect) {
				this.#firstConnect = false;
				return;
			}
			void this.#reconcile();
		});

		if (typeof document !== "undefined") {
			const onVisibility = () => {
				if (this.#destroyed) return;
				if (document.visibilityState === "hidden") {
					this.#wasHidden = true;
					return;
				}
				if (!this.#wasHidden) return;
				this.#wasHidden = false;
				void this.#reconcile();
			};
			document.addEventListener("visibilitychange", onVisibility);
			this.#removeVisibility = () =>
				document.removeEventListener("visibilitychange", onVisibility);
		}
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unlistenConnected.then((unlisten) => unlisten()).catch(console.error);
		this.#removeVisibility?.();
		this.#removeVisibility = null;
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.taps = profiles;
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
		}
	}

	async #reconcile(): Promise<void> {
		const now = Date.now();
		if (now - this.#lastReconcileAt < 2000) return;
		this.#lastReconcileAt = now;
		await this.#initial.catch(() => {});
		if (this.#destroyed) return;
		try {
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.taps = profiles;
			this.error = null;
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: "Failed to refresh taps",
				error,
			});
		}
	}
}
