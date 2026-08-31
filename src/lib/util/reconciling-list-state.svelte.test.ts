import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	fetchMock,
	reconcileHandlers,
	showErrorToastMock,
	unlistenMock,
	unsubscribeReconcileMock,
} = vi.hoisted(() => ({
	fetchMock: vi.fn(),
	reconcileHandlers: [] as (() => void | Promise<void>)[],
	showErrorToastMock: vi.fn(),
	unlistenMock: vi.fn(),
	unsubscribeReconcileMock: vi.fn(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/util/reconcile", () => ({
	reconciler: {
		subscribe(handler: () => void | Promise<void>) {
			reconcileHandlers.push(handler);
			return unsubscribeReconcileMock;
		},
	},
}));
import { ReconcilingListState } from "./reconciling-list-state.svelte";

type Item = { id: number; count: number };

class TestList extends ReconcilingListState<Item, Item[]> {
	items: Item[] = [];

	constructor() {
		super({ pageSize: 2, refreshErrorLabel: "Failed to refresh" });
		this.start();
	}

	receive(item: Item): void {
		this.upsert(item);
	}

	protected get length(): number {
		return this.items.length;
	}

	protected fetch(): Promise<Item[]> {
		return fetchMock() as Promise<Item[]>;
	}

	protected applySnapshotReturningCoveredKeys(snapshot: Item[]): Set<number> {
		this.items = snapshot;
		return new Set(snapshot.map((item) => item.id));
	}

	protected applyUpsert(item: Item): void {
		const index = this.items.findIndex(
			(existing) => existing.id === item.id,
		);
		const previous = this.items[index];
		if (previous) this.items.splice(index, 1);
		this.items = [
			{ id: item.id, count: (previous?.count ?? 0) + item.count },
			...this.items,
		];
	}

	protected keyOf(item: Item): number {
		return item.id;
	}

	protected subscribeEvents(): Promise<() => void> {
		return Promise.resolve(unlistenMock);
	}
}

function item(id: number, count = 1): Item {
	return { id, count };
}

function ids(state: TestList): number[] {
	return state.items.map((entry) => entry.id);
}

async function waitForLoaded(state: TestList) {
	await vi.waitFor(() => expect(state.loading).toBe(false));
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	fetchMock.mockReset();
	showErrorToastMock.mockReset();
	unlistenMock.mockReset();
	unsubscribeReconcileMock.mockReset();
	reconcileHandlers.length = 0;
});

describe("ReconcilingListState", () => {
	it("keeps an upsert that lands while the first fetch is in flight", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);

		const state = new TestList();
		state.receive(item(5));
		gate.resolve([item(1)]);
		await waitForLoaded(state);

		expect(ids(state)).toEqual([5, 1]);
	});

	it("does not double-apply a first-fetch upsert the snapshot already covers", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);

		const state = new TestList();
		state.receive(item(5));
		gate.resolve([item(5, 9)]);
		await waitForLoaded(state);

		expect(state.items).toEqual([item(5, 9)]);
	});

	it("defers a refresh asked for during a load and runs it once after", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const state = new TestList();

		await reconcileHandlers[0]?.();

		expect(fetchMock).toHaveBeenCalledTimes(1);

		fetchMock.mockResolvedValueOnce([item(2)]);
		gate.resolve([item(1)]);
		await waitForLoaded(state);
		await vi.waitFor(() => expect(ids(state)).toEqual([2]));

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("defers a refresh asked for during another refresh", async () => {
		fetchMock.mockResolvedValueOnce([item(1)]);
		const state = new TestList();
		await waitForLoaded(state);

		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const refreshing = reconcileHandlers[0]?.();
		await reconcileHandlers[0]?.();

		expect(fetchMock).toHaveBeenCalledTimes(2);

		fetchMock.mockResolvedValueOnce([item(3)]);
		gate.resolve([item(2)]);
		await refreshing;
		await vi.waitFor(() => expect(ids(state)).toEqual([3]));

		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("lets a fetch that starts after the request stand in for it", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const state = new TestList();

		await reconcileHandlers[0]?.();

		const retryGate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(retryGate.promise);
		state.retry();

		gate.resolve([item(1)]);
		retryGate.resolve([item(2)]);
		await waitForLoaded(state);
		await vi.waitFor(() => expect(ids(state)).toEqual([2]));

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("drops a deferred refresh when the state is destroyed first", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const state = new TestList();

		await reconcileHandlers[0]?.();
		state.destroy();
		gate.resolve([item(1)]);
		await waitForLoaded(state);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("drops a refresh result that a retry started after it", async () => {
		fetchMock.mockResolvedValueOnce([item(1)]);
		const state = new TestList();
		await waitForLoaded(state);

		const refreshGate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(refreshGate.promise);
		const refreshing = reconcileHandlers[0]?.();

		const retryGate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(retryGate.promise);
		state.retry();

		retryGate.resolve([item(3)]);
		refreshGate.resolve([item(2)]);
		await refreshing;
		await waitForLoaded(state);

		expect(ids(state)).toEqual([3]);
		expect(state.refreshing).toBe(false);
	});

	it("stays silent when a superseded refresh fails", async () => {
		fetchMock.mockResolvedValueOnce([item(1)]);
		const state = new TestList();
		await waitForLoaded(state);

		const refreshGate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(refreshGate.promise);
		const refreshing = reconcileHandlers[0]?.();

		fetchMock.mockResolvedValueOnce([item(3)]);
		state.retry();
		refreshGate.reject(new Error("stale"));
		await refreshing;
		await waitForLoaded(state);

		expect(showErrorToastMock).not.toHaveBeenCalled();
		expect(state.error).toBeNull();
		expect(ids(state)).toEqual([3]);
	});

	it("reports a refresh failure that was not superseded", async () => {
		fetchMock
			.mockResolvedValueOnce([item(1)])
			.mockRejectedValueOnce(new Error("offline"));
		const state = new TestList();
		await waitForLoaded(state);

		await reconcileHandlers[0]?.();

		expect(showErrorToastMock).toHaveBeenCalledWith({
			label: "Failed to refresh",
			error: expect.any(Error),
			onRetry: expect.any(Function),
		});
		expect(state.error).toBeNull();
		expect(ids(state)).toEqual([1]);
	});

	it("loads once, including when the list is legitimately empty", async () => {
		fetchMock.mockResolvedValueOnce([]);
		const state = new TestList();
		await waitForLoaded(state);

		state.load();

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("loads again when the first attempt failed", async () => {
		fetchMock
			.mockRejectedValueOnce(new Error("offline"))
			.mockResolvedValueOnce([item(1)]);
		const state = new TestList();
		await waitForLoaded(state);

		expect(state.error?.message).toBe("offline");

		state.load();
		await waitForLoaded(state);

		expect(state.error).toBeNull();
		expect(ids(state)).toEqual([1]);
	});

	it("ignores a fetch that resolves after destroy", async () => {
		const gate = deferred<Item[]>();
		fetchMock.mockReturnValueOnce(gate.promise);
		const state = new TestList();

		state.destroy();
		gate.resolve([item(1)]);
		await Promise.resolve();
		state.receive(item(2));

		expect(state.items).toEqual([]);
		expect(unsubscribeReconcileMock).toHaveBeenCalledOnce();
		await vi.waitFor(() => expect(unlistenMock).toHaveBeenCalledOnce());
	});
});
