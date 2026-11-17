import { type PlainMessageKey, t } from "#lib/i18n/index.ts";

export const REFRESHED_HELD_MS = 3000;

const ON_SCREEN_RATIO = 0.5;
const HIDDEN_FROM_ASSISTIVE_TECH = '[inert], [aria-hidden="true"]';
const OPEN_MODAL = '[aria-modal="true"], .pswp';

export type ListRefreshState = {
	busy: boolean;
	updating: boolean;
	failed: boolean;
};

export type TrackedRefresh = {
	follow: (state: ListRefreshState) => void;
	stop: () => void;
};

type Announcement = "refreshing" | "refreshed";

const announcementKeys = {
	refreshing: "shell.dataRefreshControl.a11y.refreshing",
	refreshed: "shell.dataRefreshControl.a11y.refreshed",
} as const satisfies Record<Announcement, PlainMessageKey>;

type TrackedList = {
	list: HTMLElement;
	onScreen: boolean;
	phase: "joining" | "idle" | "refreshing";
	ran: boolean;
	spoken: boolean;
};

export class RefreshAnnouncer {
	#announcement = $state<Announcement | null>(null);

	#tracking = 0;
	#speaking = 0;
	#allRefreshed = true;
	#clearing: ReturnType<typeof setTimeout> | undefined;

	get text(): string {
		return this.#announcement === null
			? ""
			: t(announcementKeys[this.#announcement]);
	}

	track(list: HTMLElement): TrackedRefresh {
		const tracked: TrackedList = {
			list,
			onScreen: false,
			phase: "joining",
			ran: false,
			spoken: false,
		};
		this.#tracking += 1;
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (entry)
					tracked.onScreen =
						entry.intersectionRatio >= ON_SCREEN_RATIO;
			},
			{ threshold: ON_SCREEN_RATIO },
		);
		observer.observe(list);
		return {
			follow: (state) => this.#follow({ tracked, ...state }),
			stop: () => {
				observer.disconnect();
				this.#stop(tracked);
			},
		};
	}

	#follow({
		tracked,
		busy,
		updating,
		failed,
	}: ListRefreshState & { tracked: TrackedList }): void {
		const was = tracked.phase;
		if (busy) {
			if (was === "refreshing") tracked.ran ||= updating;
			if (was !== "idle") return;
			tracked.phase = "refreshing";
			tracked.ran = updating;
			this.#begin(tracked);
			return;
		}
		tracked.phase = "idle";
		if (was === "refreshing")
			this.#end({ tracked, refreshed: tracked.ran && !failed });
	}

	#begin(tracked: TrackedList): void {
		if (!this.#heard(tracked)) return;
		if (this.#speaking === 0) {
			this.#allRefreshed = true;
			this.#show("refreshing");
		}
		tracked.spoken = true;
		this.#speaking += 1;
	}

	#end({
		tracked,
		refreshed,
	}: {
		tracked: TrackedList;
		refreshed: boolean;
	}): void {
		if (!this.#hush(tracked)) return;
		this.#allRefreshed &&= refreshed && this.#heard(tracked);
		if (this.#speaking > 0) return;
		if (!this.#allRefreshed) {
			this.#show(null);
			return;
		}
		this.#show("refreshed");
		this.#clearing = setTimeout(
			() => (this.#announcement = null),
			REFRESHED_HELD_MS,
		);
	}

	#stop(tracked: TrackedList): void {
		this.#tracking -= 1;
		const endsUnheard = this.#hush(tracked) && this.#speaking === 0;
		if (endsUnheard || this.#tracking === 0) this.#show(null);
	}

	#hush(tracked: TrackedList): boolean {
		if (!tracked.spoken) return false;
		tracked.spoken = false;
		this.#speaking -= 1;
		return true;
	}

	#show(announcement: Announcement | null): void {
		clearTimeout(this.#clearing);
		this.#announcement = announcement;
	}

	#heard({ list, onScreen }: TrackedList): boolean {
		return (
			onScreen &&
			list.closest(HIDDEN_FROM_ASSISTIVE_TECH) === null &&
			![...document.querySelectorAll(OPEN_MODAL)].some(
				(modal) => !modal.contains(list),
			)
		);
	}
}

export const refreshAnnouncer = new RefreshAnnouncer();
