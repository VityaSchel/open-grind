import { toast } from "svelte-sonner";

import { callMethod, markRequestBlocked } from "$lib/api/methods";
import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import {
	clearSessionError,
	type SessionErrorKind,
	sessionErrorState,
} from "$lib/api/session-error-state.svelte";

const STALE_REPORT_MS = 60_000;

const DISMISSAL_MS = 600_000;

const TRANSPORT_TOAST_ID = "session-transport";

export type SessionErrorReport = {
	message: string;
	unauthorized: boolean;
	kind: SessionErrorKind;
	attempts: number;
	transient: boolean;
};

type PendingReport = SessionErrorReport & { at: number };

class SessionRecovery {
	#pending: PendingReport | null = null;
	#dismissedAt = new Map<SessionErrorKind, number>();

	constructor() {
		if (typeof document === "undefined") return;
		document.addEventListener("visibilitychange", () => {
			if (document.visibilityState === "visible") void this.#promote();
		});
	}

	report(report: SessionErrorReport): void {
		if (report.unauthorized || !report.transient) {
			this.#show(report);
			return;
		}
		this.#pending = { ...report, at: Date.now() };
		void this.#promote();
	}

	recover(): void {
		this.#pending = null;
		this.#dismissedAt.clear();
		toast.dismiss(TRANSPORT_TOAST_ID);
		requestBlockedAlertState.open = false;
		clearSessionError();
	}

	dismiss(): void {
		this.#dismissedAt.set(sessionErrorState.kind, Date.now());
		sessionErrorState.open = false;
	}

	async #promote(): Promise<void> {
		const pending = this.#pending;
		if (pending === null) return;

		if (document.visibilityState !== "visible") return;

		if (Date.now() - pending.at > STALE_REPORT_MS) {
			this.#pending = null;
			return;
		}

		const health = await callMethod("session_health").catch(() => null);
		if (this.#pending !== pending) return;
		if (health !== null && !health.stale) {
			this.#pending = null;
			return;
		}

		this.#pending = null;
		this.#show(pending);
	}

	#show(report: SessionErrorReport): void {
		if (
			report.kind === "RequestBlocked" ||
			report.kind === "NetworkBlocked"
		) {
			markRequestBlocked();
			return;
		}

		sessionErrorState.message = report.message;
		sessionErrorState.kind = report.kind;
		sessionErrorState.attempts = report.attempts;
		sessionErrorState.unauthorized = report.unauthorized;

		if (report.kind === "Http" || report.kind === "RateLimited") {
			toast.error("Can't reach Grindr — retrying", {
				id: TRANSPORT_TOAST_ID,
				duration: Number.POSITIVE_INFINITY,
			});
			return;
		}

		const dismissed = this.#dismissedAt.get(report.kind);
		if (dismissed !== undefined && Date.now() - dismissed < DISMISSAL_MS) {
			return;
		}

		sessionErrorState.open = true;
	}
}

export const sessionRecovery = new SessionRecovery();
