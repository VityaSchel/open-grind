import { showErrorToast } from "$lib/api/error";
import { reconciler } from "$lib/util/reconcile";

export abstract class ReconcilingListState<TItem, TSnapshot, TKey = number> {
	loading = $state(true);
	refreshing = $state(false);
	error: Error | null = $state(null);
	visibleCount = $state(0);

	readonly #pageSize: number;
	readonly #refreshErrorLabel: string;
	#initial: Promise<void> = Promise.resolve();
	#destroyed = false;
	#unsubscribeReconcile: (() => void) | null = null;
	#unlisten: Promise<() => void> | null = null;
	#reconcileBuffer: TItem[] | null = null;

	constructor({
		pageSize,
		refreshErrorLabel,
	}: {
		pageSize: number;
		refreshErrorLabel: string;
	}) {
		this.#pageSize = pageSize;
		this.#refreshErrorLabel = refreshErrorLabel;
		this.visibleCount = pageSize;
	}

	// Subclasses must call this at the END of their constructor: subclass $state
	// fields only exist after super() returns.
	protected start(): void {
		this.#initial = this.#initialLoad();
		this.#unsubscribeReconcile = reconciler.subscribe(() => this.#reconcile());
		this.#unlisten = this.subscribeEvents();
	}

	protected get destroyed(): boolean {
		return this.#destroyed;
	}

	get hasMore(): boolean {
		return this.visibleCount < this.length;
	}

	loadMore(): void {
		if (!this.hasMore) return;
		this.visibleCount += this.#pageSize;
	}

	retry(): void {
		this.#initial = this.#initialLoad();
	}

	refresh(): Promise<void> {
		return this.#reconcile();
	}

	destroy(): void {
		if (this.#destroyed) return;
		this.#destroyed = true;
		this.#unsubscribeReconcile?.();
		this.#unlisten?.then((unlisten) => unlisten()).catch(console.error);
	}

	protected upsert(item: TItem): void {
		if (this.#destroyed) return;
		this.#reconcileBuffer?.push(item);
		this.applyUpsert(item);
	}

	async #initialLoad(): Promise<void> {
		this.loading = true;
		this.error = null;
		try {
			const snapshot = await this.fetch();
			if (this.#destroyed) return;
			this.applySnapshot(snapshot);
		} catch (err) {
			if (this.#destroyed) return;
			this.error = err instanceof Error ? err : new Error(String(err));
		} finally {
			this.loading = false;
		}
	}

	async #reconcile(): Promise<void> {
		if (this.#destroyed || this.refreshing) return;
		this.refreshing = true;
		// Buffer upserts arriving mid-fetch so the wholesale replace can't drop them.
		const buffer: TItem[] = [];
		this.#reconcileBuffer = buffer;
		try {
			await this.#initial.catch(() => {});
			if (this.#destroyed) return;
			const snapshot = await this.fetch();
			if (this.#destroyed) return;
			const known = this.applySnapshot(snapshot);
			for (const item of buffer) {
				if (!known.has(this.keyOf(item))) this.applyUpsert(item);
			}
			this.error = null;
		} catch (error) {
			console.error(error);
			showErrorToast({ label: this.#refreshErrorLabel, error });
		} finally {
			if (this.#reconcileBuffer === buffer) this.#reconcileBuffer = null;
			this.refreshing = false;
		}
	}

	protected abstract get length(): number;
	protected abstract fetch(): Promise<TSnapshot>;
	// Assigns the snapshot to the store; returns the keys it covers, so buffered
	// upserts the snapshot already includes are skipped on replay.
	protected abstract applySnapshot(snapshot: TSnapshot): Set<TKey>;
	protected abstract applyUpsert(item: TItem): void;
	protected abstract keyOf(item: TItem): TKey;
	protected abstract subscribeEvents(): Promise<() => void>;
}
