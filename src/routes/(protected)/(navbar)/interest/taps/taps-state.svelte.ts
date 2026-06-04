import { showErrorToast } from "$lib/api/error";
import { getReceivedTaps } from "$lib/api/interest/taps";
import { tapV1TapSentEventSchema, ws } from "$lib/ws.svelte";
import type { TapProfile } from "$lib/model/interest/tap-profile";

const PAGE_SIZE = 20;

export class TapsState {
	loading = $state(true);
	error: Error | null = $state(null);
	visibleCount = $state(PAGE_SIZE);

	#all: TapProfile[] = $state([]);

	get taps(): TapProfile[] {
		return this.#all.slice(0, this.visibleCount);
	}

	get hasMore(): boolean {
		return this.visibleCount < this.#all.length;
	}

	readonly ourProfileId: number;

	#initial: Promise<void>;
	#destroyed = false;
	#firstConnect = true;
	#wasHidden = false;
	#lastReconcileAt = 0;
	#unlistenConnected: Promise<() => void>;
	#unlistenTap: Promise<() => void>;
	#removeVisibility: (() => void) | null = null;

	constructor({ ourProfileId }: { ourProfileId: number }) {
		this.ourProfileId = ourProfileId;
		this.#initial = this.#initialLoad();

		this.#unlistenConnected = ws.onConnected(() => {
			if (this.#destroyed) return;
			if (this.#firstConnect) {
				this.#firstConnect = false;
				return;
			}
			void this.#reconcile();
		});

		this.#unlistenTap = ws.on(
			"tap.v1.tap_sent",
			tapV1TapSentEventSchema,
			(event) => {
				if (this.#destroyed) return;
				const tap = event.payload;
				if (tap.recipientId !== this.ourProfileId) return;
				this.#upsert({
					distance: null,
					profileImageMediaHash: tap.senderProfileImageHash,
					isFavorite: false,
					profileId: tap.senderId,
					displayName: tap.senderDisplayName,
					timestamp: tap.timestamp,
					tapType: tap.tapType,
					lastOnline: tap.timestamp,
					isBoosting: false,
					isMutual: tap.isMutual,
					rightNowType: "",
					isViewable: true,
				});
			},
		);

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
		this.#unlistenTap.then((unlisten) => unlisten()).catch(console.error);
		this.#removeVisibility?.();
		this.#removeVisibility = null;
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += PAGE_SIZE;
	}

	#upsert(tap: TapProfile): void {
		const existing = this.#all.findIndex((t) => t.profileId === tap.profileId);
		if (existing !== -1) this.#all.splice(existing, 1);
		this.#all = [tap, ...this.#all];
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const { profiles } = await getReceivedTaps();
			if (this.#destroyed) return;
			this.#all = profiles;
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
			this.#all = profiles;
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
