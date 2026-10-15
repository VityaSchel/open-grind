import { untrack } from "svelte";

import { showErrorToast } from "$lib/api/error-toast";
import { showsOnReturn, staysOnline } from "$lib/presence/presence-gate";
import { Generation } from "$lib/util/generation";
import { reconciler } from "$lib/util/reconcile";

export abstract class ReconcilingListState<TItem, TSnapshot, TKey = number> {
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	visibleCount = $state(0);
	scrollY = 0;
	viewActive = false;

	readonly #pageSize: number;
	readonly #refreshErrorLabel: string;
	readonly #marksOnline: boolean;
	#attempted = false;
	#loaded = false;
	#stale = false;
	#destroyed = false;
	#unsubscribeReconcile: (() => void) | null = null;
	#unlisten: Promise<() => void> | null = null;
	#buffer: TItem[] | null = null;
	#generation = new Generation();
	#refreshRequestedSinceFetchStart = false;

	constructor({
		pageSize,
		refreshErrorLabel,
		marksOnline = false,
	}: {
		pageSize: number;
		refreshErrorLabel: string;
		marksOnline?: boolean;
	}) {
		this.#pageSize = pageSize;
		this.#refreshErrorLabel = refreshErrorLabel;
		this.#marksOnline = marksOnline;
		this.visibleCount = pageSize;
	}

	// A subclass calls this last: its fields exist only after super() returns.
	protected start(): void {
		if (!this.#marksOnline || untrack(staysOnline)) void this.#hardLoad();
		else this.#stale = true;
		this.#unsubscribeReconcile = reconciler.subscribe(
			(cause) => this.refreshOrDefer({ attended: cause === "resume" }),
			{ onFoldedResume: () => this.#catchUpOnResume() },
		);
		this.#unlisten = this.subscribeEvents();
	}

	async refreshOrDefer({ attended }: { attended: boolean }): Promise<void> {
		if (
			!this.#marksOnline ||
			staysOnline() ||
			(attended && (await showsOnReturn({ viewActive: this.viewActive })))
		)
			return this.refresh();
		this.#stale = true;
	}

	attachView(): () => void {
		this.viewActive = true;
		untrack(() => {
			if (!this.#loaded) this.load();
			else if (this.#stale) void this.refresh();
		});
		return () => {
			this.viewActive = false;
		};
	}

	#catchUpOnResume(): Promise<void> {
		return this.#stale
			? this.refreshOrDefer({ attended: true })
			: Promise.resolve();
	}

	get hasMore(): boolean {
		return this.visibleCount < this.length;
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += this.#pageSize;
	}

	load(): void {
		if (
			this.#attempted &&
			(this.#loaded || this.loading || this.refreshing)
		)
			return;
		this.retry();
	}

	retry(): void {
		void this.#hardLoad();
	}

	async refresh(): Promise<void> {
		if (this.#destroyed) return;
		if (!this.#attempted) return this.#hardLoad();
		if (this.refreshing || this.loading) {
			this.#refreshRequestedSinceFetchStart = true;
			return;
		}
		this.refreshing = true;
		try {
			await this.#replaceFromServer();
		} catch (error) {
			console.error(error);
			showErrorToast({
				label: this.#refreshErrorLabel,
				error,
				onRetry: () => void this.refresh(),
			});
		} finally {
			this.refreshing = false;
			this.#runRequestedRefresh();
		}
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unsubscribeReconcile?.();
		this.#unlisten
			?.then((unlisten) => unlisten())
			.catch((error) => console.error(error));
	}

	protected upsert(item: TItem): void {
		if (this.#destroyed) return;
		this.#buffer?.push(item);
		this.applyUpsert(item);
	}

	async #hardLoad(): Promise<void> {
		this.#attempted = true;
		this.loading = true;
		this.error = null;
		try {
			await this.#replaceFromServer();
		} catch (error) {
			this.error =
				error instanceof Error ? error : new Error(String(error));
		} finally {
			this.loading = false;
			this.#runRequestedRefresh();
		}
	}

	#runRequestedRefresh(): void {
		if (!this.#refreshRequestedSinceFetchStart) return;
		this.#refreshRequestedSinceFetchStart = false;
		void this.refresh();
	}

	async #replaceFromServer(): Promise<void> {
		if (this.#destroyed) return;
		const generation = this.#generation.next();
		this.#refreshRequestedSinceFetchStart = false;
		this.#stale = false;
		const buffer: TItem[] = [];
		this.#buffer = buffer;
		try {
			const snapshot = await this.fetch();
			if (this.#superseded(generation)) return;
			const covered = this.applySnapshotReturningCoveredKeys(snapshot);
			for (const item of buffer) {
				if (!covered.has(this.keyOf(item))) this.applyUpsert(item);
			}
			this.#loaded = true;
			this.error = null;
		} catch (error) {
			if (this.#superseded(generation)) return;
			throw error;
		} finally {
			if (this.#buffer === buffer) this.#buffer = null;
		}
	}

	#superseded(generation: number): boolean {
		return this.#destroyed || this.#generation.isStale(generation);
	}

	protected abstract get length(): number;
	protected abstract fetch(): Promise<TSnapshot>;
	protected abstract applySnapshotReturningCoveredKeys(
		snapshot: TSnapshot,
	): Set<TKey>;
	protected abstract applyUpsert(item: TItem): void;
	protected abstract keyOf(item: TItem): TKey;
	protected abstract subscribeEvents(): Promise<() => void>;
}
