import { beforeEach, expect, it, vi } from "vitest";

const { getProfilesMock, showErrorToastMock } = vi.hoisted(() => ({
	getProfilesMock:
		vi.fn<(profileIds: number[]) => Promise<{ profileId: number }[]>>(),
	showErrorToastMock: vi.fn<(options: { label?: string }) => void>(),
}));

vi.mock("$lib/api/users/profiles", () => ({ getProfiles: getProfilesMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import type { ProfileListProfile } from "./profile-list";
import { ProfileListState } from "./profile-list-state.svelte";

const IDS = Array.from({ length: 120 }, (_, index) => 1000 + index);
const RELOADED_IDS = Array.from({ length: 120 }, (_, index) => 2000 + index);

const resolvedProfile = (profileId: number) =>
	({
		profileId,
		displayName: `User ${profileId}`,
	}) as unknown as ProfileListProfile;

function createList({
	loadIds = () => Promise.resolve(IDS),
	setOn = vi.fn<
		(target: { profileId: number; on: boolean }) => Promise<void>
	>(() => Promise.resolve()),
	eager = false,
} = {}) {
	const list = new ProfileListState(() => ({
		loadIds,
		setOn,
		errorLabel: {
			turningOn: "Failed to block",
			turningOff: "Failed to unblock",
		},
		eager,
	}));
	return { list, setOn };
}

async function loadedList(options?: Parameters<typeof createList>[0]) {
	const created = createList(options);
	await vi.waitFor(() => expect(created.list.loading).toBe(false));
	return created;
}

const requestedIds = (call: number) => getProfilesMock.mock.calls[call]?.[0];

beforeEach(() => {
	vi.clearAllMocks();
	getProfilesMock.mockImplementation((profileIds) =>
		Promise.resolve(profileIds.map(resolvedProfile)),
	);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

it("takes the whole id list but resolves no profile before anything is visible", async () => {
	const { list } = await loadedList();

	expect(list.ids).toEqual(IDS);
	expect(getProfilesMock).not.toHaveBeenCalled();
});

it("resolves every profile up front when eager, before anything is visible", async () => {
	const { list } = await loadedList({ eager: true });

	await vi.waitFor(() => expect(list.profile(1119)).toBeDefined());
	expect(getProfilesMock).toHaveBeenCalledTimes(1);
	expect(requestedIds(0)).toEqual(IDS);

	list.setVisible({ start: 0, end: 20 });
	expect(getProfilesMock).toHaveBeenCalledTimes(1);
});

it("resolves the visible range as one batched request", async () => {
	const { list } = await loadedList();

	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());

	expect(getProfilesMock).toHaveBeenCalledTimes(1);
	expect(requestedIds(0)).toEqual(IDS.slice(0, 50));
	expect(list.profile(1050)).toBeUndefined();
});

it("stops at an exact chunk boundary without touching the next chunk", async () => {
	const { list } = await loadedList();

	list.setVisible({ start: 40, end: 50 });
	await vi.waitFor(() => expect(list.profile(1049)).toBeDefined());

	expect(getProfilesMock).toHaveBeenCalledTimes(1);
	expect(requestedIds(0)).toEqual(IDS.slice(0, 50));
	expect(list.profile(1050)).toBeUndefined();
});

it("batches a range spanning two chunks into a single request", async () => {
	const { list } = await loadedList();

	list.setVisible({ start: 40, end: 60 });
	await vi.waitFor(() => expect(list.profile(1050)).toBeDefined());

	expect(getProfilesMock).toHaveBeenCalledTimes(1);
	expect(requestedIds(0)).toEqual(IDS.slice(0, 100));
});

it("leaves resolved chunks alone and fetches only what scrolling reveals", async () => {
	const { list } = await loadedList();

	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());

	list.setVisible({ start: 10, end: 30 });
	expect(getProfilesMock).toHaveBeenCalledTimes(1);

	list.setVisible({ start: 45, end: 65 });
	await vi.waitFor(() => expect(list.profile(1050)).toBeDefined());
	expect(getProfilesMock).toHaveBeenCalledTimes(2);
	expect(requestedIds(1)).toEqual(IDS.slice(50, 100));
});

it("keeps one request in flight and then serves wherever the scroll landed", async () => {
	const { list } = await loadedList();
	let release: ((profiles: { profileId: number }[]) => void) | null = null;
	getProfilesMock.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = resolve;
			}),
	);

	list.setVisible({ start: 0, end: 20 });
	list.setVisible({ start: 100, end: 120 });
	expect(getProfilesMock).toHaveBeenCalledTimes(1);

	release!(IDS.slice(0, 50).map(resolvedProfile));
	await vi.waitFor(() => expect(getProfilesMock).toHaveBeenCalledTimes(2));
	expect(requestedIds(1)).toEqual(IDS.slice(100, 120));
});

it("resolves the reloaded list and discards a stale request that lands late", async () => {
	const loadIds = vi
		.fn<() => Promise<number[]>>()
		.mockResolvedValueOnce(IDS)
		.mockResolvedValue(RELOADED_IDS);
	const { list } = await loadedList({ loadIds });
	let release: ((profiles: { profileId: number }[]) => void) | null = null;
	getProfilesMock.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				release = resolve;
			}),
	);

	list.setVisible({ start: 0, end: 20 });
	expect(getProfilesMock).toHaveBeenCalledTimes(1);
	await list.load();
	release!(IDS.slice(0, 50).map(resolvedProfile));

	await vi.waitFor(() => expect(list.profile(2000)).toBeDefined());
	expect(list.profile(1000)).toBeUndefined();
	expect(getProfilesMock).toHaveBeenCalledTimes(2);
	expect(requestedIds(1)).toEqual(RELOADED_IDS.slice(0, 50));
});

it("resolves the reloaded list without a toast when a stale request rejects late", async () => {
	const loadIds = vi
		.fn<() => Promise<number[]>>()
		.mockResolvedValueOnce(IDS)
		.mockResolvedValue(RELOADED_IDS);
	const { list } = await loadedList({ loadIds });
	let reject: ((error: Error) => void) | null = null;
	getProfilesMock.mockImplementationOnce(
		() =>
			new Promise((_, rejectPromise) => {
				reject = rejectPromise;
			}),
	);

	list.setVisible({ start: 0, end: 20 });
	await list.load();
	reject!(new Error("stale network"));

	await vi.waitFor(() => expect(list.profile(2000)).toBeDefined());
	expect(showErrorToastMock).not.toHaveBeenCalled();
});

it("marks ids the server omits as unavailable", async () => {
	const { list } = await loadedList();
	getProfilesMock.mockImplementationOnce((profileIds) =>
		Promise.resolve(
			profileIds.filter((id) => id !== 1003).map(resolvedProfile),
		),
	);

	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());

	expect(list.profile(1003)).toBeNull();
});

it("retries a failed chunk the next time its range is asked for", async () => {
	const { list } = await loadedList();
	getProfilesMock.mockRejectedValueOnce(new Error("network"));

	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());

	list.setVisible({ start: 0, end: 25 });
	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());
	expect(getProfilesMock).toHaveBeenCalledTimes(2);
});

it("retries a failed chunk from the error toast's retry action", async () => {
	const { list } = await loadedList();
	getProfilesMock.mockRejectedValueOnce(new Error("network"));

	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(showErrorToastMock).toHaveBeenCalled());
	const { onRetry } = showErrorToastMock.mock.calls[0]![0] as {
		onRetry: () => void;
	};

	onRetry();

	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());
	expect(getProfilesMock).toHaveBeenCalledTimes(2);
});

it("stays silent about requests that reject after dispose", async () => {
	const { list } = await loadedList();
	let reject: ((error: Error) => void) | null = null;
	getProfilesMock.mockImplementationOnce(
		() =>
			new Promise((_, rejectPromise) => {
				reject = rejectPromise;
			}),
	);

	list.setVisible({ start: 0, end: 20 });
	list.dispose();
	reject!(new Error("network"));

	await vi.waitFor(() => expect(getProfilesMock).toHaveBeenCalledTimes(1));
	expect(showErrorToastMock).not.toHaveBeenCalled();
	expect(list.profile(1000)).toBeUndefined();
});

it("keeps the toggle state outside the row so it survives rerendering", async () => {
	const { list, setOn } = await loadedList();

	await list.toggle(1000);
	expect(setOn).toHaveBeenCalledWith({ profileId: 1000, on: false });
	expect(list.isOn(1000)).toBe(false);

	await list.toggle(1000);
	expect(setOn).toHaveBeenLastCalledWith({ profileId: 1000, on: true });
	expect(list.isOn(1000)).toBe(true);
});

it("rolls the toggle back when the request fails", async () => {
	const { list } = await loadedList({
		setOn: vi.fn(() => Promise.reject(new Error("nope"))),
	});

	await list.toggle(1000);

	expect(list.isOn(1000)).toBe(true);
	expect(showErrorToastMock).toHaveBeenCalledWith(
		expect.objectContaining({ label: "Failed to unblock" }),
	);
});

it("reports a failure to load the id list", async () => {
	const { list } = createList({
		loadIds: () => Promise.reject(new Error("down")),
	});

	await vi.waitFor(() => expect(list.error).toBeInstanceOf(Error));
	expect(list.loading).toBe(false);
	expect(list.ids).toEqual([]);
});

it("recovers from a failed id-list load on the next load()", async () => {
	const loadIds = vi
		.fn<() => Promise<number[]>>()
		.mockRejectedValueOnce(new Error("down"))
		.mockResolvedValue(IDS);
	const { list } = createList({ loadIds });
	await vi.waitFor(() => expect(list.error).toBeInstanceOf(Error));

	await list.load();

	expect(list.error).toBeNull();
	expect(list.loading).toBe(false);
	expect(list.ids).toEqual(IDS);
	list.setVisible({ start: 0, end: 20 });
	await vi.waitFor(() => expect(list.profile(1000)).toBeDefined());
});
