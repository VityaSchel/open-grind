import { appLifecycle } from "$lib/api/app-lifecycle.svelte";
import { signedInProfileId } from "$lib/api/current-session";
import { awaitHomeLocation } from "$lib/entitlements/honduras-hold";
import { isMobilePlatform } from "$lib/platform/os";
import { ws } from "$lib/ws.svelte";

const THROTTLE_MS = 2000;
const DESKTOP_LONG_ABSENCE_MS = 5 * 60 * 1000;

export type ReconcileCause = "resume" | "reconnect" | "resync";

export type ReconcileHandler = (cause: ReconcileCause) => void | Promise<void>;

type FoldedResumeHandler = () => void | Promise<void>;

class Reconciler {
	#handlers = new Set<ReconcileHandler>();
	#foldedResumeHandlers = new Set<FoldedResumeHandler>();
	#dispatched: Promise<void> = Promise.resolve();
	#lastReconcileAt = 0;
	#lastCause: ReconcileCause | null = null;
	#resyncTimer: ReturnType<typeof setTimeout> | null = null;
	#hiddenAt: number | null = null;
	#firstConnect = true;

	constructor() {
		ws.onConnected(() => {
			if (this.#firstConnect) {
				this.#firstConnect = false;
				return;
			}
			void this.#trigger("reconnect");
		}).catch((error) => console.error(error));

		ws.onEventsDropped((skipped) => {
			console.warn(`[ws] resyncing after ${skipped} dropped events`);
			this.#scheduleResync();
		}).catch((error) => console.error(error));

		ws.onEventRejected((eventType) => {
			console.warn(`[ws] resyncing after rejecting a ${eventType} event`);
			this.#scheduleResync();
		});

		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", () => {
				if (document.visibilityState === "hidden") {
					this.#hiddenAt = Date.now();
					return;
				}
				if (this.#hiddenAt === null) return;
				const awayMs = Date.now() - this.#hiddenAt;
				this.#hiddenAt = null;
				if (!isMobilePlatform() && awayMs < DESKTOP_LONG_ABSENCE_MS)
					return;
				void appLifecycle
					.activate()
					.then(() => this.#trigger("resume"));
			});
		}
	}

	subscribe(
		handler: ReconcileHandler,
		{ onFoldedResume }: { onFoldedResume?: FoldedResumeHandler } = {},
	): () => void {
		this.#handlers.add(handler);
		if (onFoldedResume) this.#foldedResumeHandlers.add(onFoldedResume);
		return () => {
			this.#handlers.delete(handler);
			if (onFoldedResume)
				this.#foldedResumeHandlers.delete(onFoldedResume);
		};
	}

	#scheduleResync(): void {
		if (this.#resyncTimer !== null) return;
		const elapsed = Date.now() - this.#lastReconcileAt;
		const wait = Math.max(THROTTLE_MS - elapsed, 0);
		this.#resyncTimer = setTimeout(() => {
			this.#resyncTimer = null;
			void this.#trigger("resync");
		}, wait);
	}

	async #trigger(cause: ReconcileCause): Promise<void> {
		const now = Date.now();
		const throttled = now - this.#lastReconcileAt < THROTTLE_MS;
		const folded =
			throttled && cause === "resume" && this.#lastCause !== "resume";
		if (throttled && !folded) return;
		this.#lastCause = cause;
		if (folded) {
			await this.#dispatched;
			await this.#run({ handlers: [...this.#foldedResumeHandlers] });
			return;
		}
		this.#lastReconcileAt = now;
		let markDispatched!: () => void;
		this.#dispatched = new Promise((resolve) => {
			markDispatched = () => resolve();
		});
		await this.#run({
			handlers: [...this.#handlers].map(
				(handler) => () => handler(cause),
			),
			onDispatch: markDispatched,
		});
	}

	async #run({
		handlers,
		onDispatch,
	}: {
		handlers: FoldedResumeHandler[];
		onDispatch?: () => void;
	}): Promise<void> {
		const running = await this.#dispatch(handlers).finally(() =>
			onDispatch?.(),
		);
		await Promise.all(running);
	}

	async #dispatch(handlers: FoldedResumeHandler[]): Promise<Promise<void>[]> {
		await awaitHomeLocation();
		const profileId = await signedInProfileId().catch(() => null);
		if (profileId === null) return [];
		return handlers.map(async (run) => {
			try {
				await run();
			} catch (error) {
				console.error("Reconcile handler failed", error);
			}
		});
	}
}

export const reconciler = new Reconciler();
