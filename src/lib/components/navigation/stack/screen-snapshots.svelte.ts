import {
	afterNavigate,
	type NavigationType,
	onNavigate,
} from "$app/navigation";
import { on } from "svelte/events";
import { SvelteMap } from "svelte/reactivity";

import { onSignOut } from "#lib/api/sign-out.ts";
import { onProfileEdit } from "#lib/api/users/profiles.ts";
import { type FormatLocales, getFormatLocales } from "#lib/i18n/index.ts";
import { liveHistoryIndex } from "#lib/util/history-index.ts";
import { earlierPathnames } from "#lib/util/history.ts";
import type { Snapshot } from "./snapshot";

export type SnapshotKind = "pane" | "screen";

type CachedSnapshot = {
	snapshot: Snapshot;
	kind: SnapshotKind;
	locales: FormatLocales;
};

const CACHED_ENTRIES = 4;

export class ScreenSnapshots {
	readonly #cached = new SvelteMap<number, CachedSnapshot>();
	readonly #historyIndex: () => number | undefined;
	#shown = $state<number | undefined>();

	constructor({
		historyIndex = liveHistoryIndex,
	}: { historyIndex?: () => number | undefined } = {}) {
		this.#historyIndex = historyIndex;
	}

	accepts(): boolean {
		return this.#pushedFromEntry() !== undefined;
	}

	replaces(): boolean {
		const shown = this.#shown;
		return shown !== undefined && this.#historyIndex() === shown;
	}

	remember({
		snapshot,
		kind,
	}: {
		snapshot: Snapshot;
		kind: SnapshotKind;
	}): boolean {
		const shown = this.#pushedFromEntry();
		if (shown === undefined) return false;
		this.#dropFrom(shown + 1);
		this.#cached.set(shown, {
			snapshot,
			kind,
			locales: getFormatLocales(),
		});
		const evicted = [...this.#cached.keys()]
			.sort((a, b) => a - b)
			.slice(0, Math.max(this.#cached.size - CACHED_ENTRIES, 0));
		for (const entry of evicted) this.#cached.delete(entry);
		return true;
	}

	behind(kind: SnapshotKind): Snapshot | undefined {
		const shown = this.#shown;
		if (shown === undefined) return undefined;
		const cached = this.#cached.get(shown - 1);
		if (
			cached === undefined ||
			cached.kind !== kind ||
			cached.locales !== getFormatLocales() ||
			cached.snapshot.path !== earlierPathnames()[0]
		)
			return undefined;
		return cached.snapshot;
	}

	navigating(): void {
		const destination = this.#historyIndex();
		if (destination === undefined) this.clear();
		else this.#dropFrom(destination);
	}

	navigated({ type }: { type: NavigationType }): void {
		if (type === "enter") this.clear();
		this.#shown = this.#historyIndex();
	}

	clear(): void {
		this.#cached.clear();
	}

	forget({ path }: { path: string }): void {
		for (const [entry, { snapshot }] of [...this.#cached])
			if (snapshot.path === path) this.#cached.delete(entry);
	}

	#pushedFromEntry(): number | undefined {
		const shown = this.#shown;
		const destination = this.#historyIndex();
		if (
			shown === undefined ||
			destination === undefined ||
			destination <= shown
		)
			return undefined;
		return shown;
	}

	#dropFrom(entry: number): void {
		for (const key of [...this.#cached.keys()])
			if (key >= entry) this.#cached.delete(key);
	}
}

export const screenSnapshots = new ScreenSnapshots();

function clearOnSignOut(): Promise<void> {
	screenSnapshots.clear();
	return Promise.resolve();
}

export function trackScreenSnapshots(): void {
	onSignOut(clearOnSignOut);
	onNavigate(() => screenSnapshots.navigating());
	afterNavigate(({ type }) => screenSnapshots.navigated({ type }));
	$effect(() =>
		onProfileEdit(({ profileId }) =>
			screenSnapshots.forget({ path: `/profile/${profileId}` }),
		),
	);
	$effect(() => {
		let width = innerWidth;
		return on(window, "resize", () => {
			if (innerWidth === width) return;
			width = innerWidth;
			screenSnapshots.clear();
		});
	});
}
