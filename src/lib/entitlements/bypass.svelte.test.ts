import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	callMethodMock,
	reconnectMock,
	showErrorToastMock,
	toastMock,
	updateLocationMock,
	preferencesMock,
	HONDURAS_GEOHASH,
	HOME_GEOHASH,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	reconnectMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	toastMock: { error: vi.fn() },
	updateLocationMock: vi.fn(),
	preferencesMock: vi.fn(),
	HONDURAS_GEOHASH: "d4b1hqtcyz1k",
	HOME_GEOHASH: "u33dc0cpnp0m",
}));

vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/ws.svelte", () => ({ ws: { reconnect: reconnectMock } }));
vi.mock("./honduras", () => ({
	randomHondurasGeohash: () => HONDURAS_GEOHASH,
}));
vi.mock("$lib/api/browse/location", () => ({
	updateLocation: updateLocationMock,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	getPreferencesSnapshot: preferencesMock,
}));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	awaitEntitlementGrant,
	dismissEntitlementBypass,
	entitlementBypassState,
	offerEntitlementBypass,
	runEntitlementBypass,
} from "./bypass.svelte";

const RUN_TIMEOUT_MS = 15_000;

const REASON = "Unsending a message requires a Grindr subscription.";

beforeEach(() => {
	vi.clearAllMocks();
	callMethodMock.mockResolvedValue({ profileId: 1 });
	reconnectMock.mockResolvedValue(undefined);
	updateLocationMock.mockResolvedValue(undefined);
	preferencesMock.mockReturnValue({ geohash: HOME_GEOHASH });
	dismissEntitlementBypass();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("offerEntitlementBypass", () => {
	it("opens the prompt with the caller's reason", () => {
		offerEntitlementBypass({
			reason: REASON,
			retry: vi.fn(() => Promise.resolve()),
		});

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.reason).toBe(REASON);
		expect(entitlementBypassState.busy).toBe(false);
	});

	it("collects a batch of failures behind one prompt", async () => {
		const first = vi.fn(() => Promise.resolve());
		const second = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry: first });
		offerEntitlementBypass({ reason: "another feature", retry: second });

		expect(entitlementBypassState.reason).toBe(REASON);

		await runEntitlementBypass();

		expect(callMethodMock).toHaveBeenCalledTimes(1);
		expect(first).toHaveBeenCalledOnce();
		expect(second).toHaveBeenCalledOnce();
	});
});

describe("dismissEntitlementBypass", () => {
	it("closes the prompt and drops the blocked actions", async () => {
		const retry = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry });

		dismissEntitlementBypass();
		await runEntitlementBypass();

		expect(entitlementBypassState.open).toBe(false);
		expect(retry).not.toHaveBeenCalled();
	});
});

describe("runEntitlementBypass", () => {
	it("reissues the token from Honduras, then retries", async () => {
		const order: string[] = [];
		callMethodMock.mockImplementation(() => {
			order.push("refresh");
			return Promise.resolve({ profileId: 1 });
		});
		offerEntitlementBypass({
			reason: REASON,
			retry: () => {
				order.push("retry");
				return Promise.resolve();
			},
		});

		await runEntitlementBypass();

		expect(order).toEqual(["refresh", "retry"]);
		expect(callMethodMock).toHaveBeenCalledWith("refresh_token", {
			geohash: HONDURAS_GEOHASH,
		});
		expect(entitlementBypassState.open).toBe(false);
		expect(entitlementBypassState.busy).toBe(false);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("moves to Honduras, reissues there, then moves back", async () => {
		const order: string[] = [];
		updateLocationMock.mockImplementation(
			({ geohash }: { geohash: string }) => {
				order.push(
					geohash === HONDURAS_GEOHASH ? "move:hn" : "move:home",
				);
				return Promise.resolve();
			},
		);
		callMethodMock.mockImplementation(() => {
			order.push("refresh");
			return Promise.resolve({ profileId: 1 });
		});
		reconnectMock.mockImplementation(() => {
			order.push("reconnect");
			return Promise.resolve();
		});
		offerEntitlementBypass({
			reason: REASON,
			retry: () => {
				order.push("retry");
				return Promise.resolve();
			},
		});

		await runEntitlementBypass();

		expect(order).toEqual([
			"move:hn",
			"refresh",
			"move:home",
			"reconnect",
			"retry",
		]);
		expect(callMethodMock).toHaveBeenCalledWith("refresh_token", {
			geohash: HONDURAS_GEOHASH,
		});
	});

	it("moves back even when reissuing the session fails", async () => {
		callMethodMock.mockRejectedValue(new Error("offline"));
		offerEntitlementBypass({
			reason: REASON,
			retry: vi.fn(() => Promise.resolve()),
		});

		await runEntitlementBypass();

		expect(updateLocationMock).toHaveBeenLastCalledWith({
			geohash: HOME_GEOHASH,
		});
	});

	it("refuses to spoof when there is no location to come back to", async () => {
		preferencesMock.mockReturnValue({ geohash: null });
		const retry = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry });

		await runEntitlementBypass();

		expect(updateLocationMock).not.toHaveBeenCalled();
		expect(callMethodMock).not.toHaveBeenCalled();
		expect(retry).not.toHaveBeenCalled();
		expect(entitlementBypassState.open).toBe(false);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Set your location before using this bypass",
			{ id: "entitlement-bypass" },
		);
	});

	it("holds the grid off until the session has been reissued", async () => {
		let finishRefresh!: () => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishRefresh = () => resolve({ profileId: 1 });
				}),
		);
		offerEntitlementBypass({
			reason: REASON,
			retry: vi.fn(() => Promise.resolve()),
		});

		const running = runEntitlementBypass();
		await vi.waitFor(() => expect(finishRefresh).toBeDefined());
		let gridReleased = false;
		const grid = awaitEntitlementGrant().then(() => (gridReleased = true));
		await Promise.resolve();
		expect(gridReleased).toBe(false);

		finishRefresh();
		await grid;
		await running;
		expect(gridReleased).toBe(true);
	});

	it("gives up rather than trapping the user in the prompt", async () => {
		vi.useFakeTimers();
		try {
			callMethodMock.mockReturnValue(new Promise(() => {}));
			offerEntitlementBypass({
				reason: REASON,
				retry: vi.fn(() => Promise.resolve()),
			});

			const running = runEntitlementBypass();
			await vi.advanceTimersByTimeAsync(0);
			expect(entitlementBypassState.busy).toBe(true);

			await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
			await running;
		} finally {
			vi.useRealTimers();
		}

		expect(entitlementBypassState.busy).toBe(false);
		expect(entitlementBypassState.open).toBe(false);
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error: expect.anything(),
		});
	});

	it("never leaves the grid waiting on a failed handover", async () => {
		let failRefresh!: () => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((_, reject) => {
					failRefresh = () => reject(new Error("offline"));
				}),
		);
		offerEntitlementBypass({
			reason: REASON,
			retry: vi.fn(() => Promise.resolve()),
		});

		const running = runEntitlementBypass();
		await vi.waitFor(() => expect(failRefresh).toBeDefined());
		let released = false;
		void awaitEntitlementGrant().then(() => (released = true));
		await Promise.resolve();
		expect(released).toBe(false);

		failRefresh();
		await running;

		expect(released).toBe(true);
	});

	it("keeps the grid gated until the move back from Honduras lands", async () => {
		let finishHome!: () => void;
		updateLocationMock.mockImplementation(
			({ geohash }: { geohash: string }) =>
				geohash === HOME_GEOHASH
					? new Promise<void>((resolve) => {
							finishHome = resolve;
						})
					: Promise.resolve(),
		);
		offerEntitlementBypass({
			reason: REASON,
			retry: vi.fn(() => Promise.resolve()),
		});

		const running = runEntitlementBypass();
		await vi.waitFor(() => expect(finishHome).toBeDefined());
		let released = false;
		void awaitEntitlementGrant().then(() => (released = true));
		await Promise.resolve();
		expect(released).toBe(false);

		finishHome();
		await running;

		expect(released).toBe(true);
	});

	it("moves back home before it gives up on a hung reissue", async () => {
		vi.useFakeTimers();
		try {
			callMethodMock.mockReturnValue(new Promise(() => {}));
			offerEntitlementBypass({
				reason: REASON,
				retry: vi.fn(() => Promise.resolve()),
			});

			const running = runEntitlementBypass();
			await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
			await running;
		} finally {
			vi.useRealTimers();
		}

		expect(updateLocationMock).toHaveBeenLastCalledWith({
			geohash: HOME_GEOHASH,
		});
		await expect(awaitEntitlementGrant()).resolves.toBeUndefined();
	});

	it("joins a run already in flight instead of spoofing twice", async () => {
		let finishRefresh!: () => void;
		callMethodMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					finishRefresh = () => resolve({ profileId: 1 });
				}),
		);
		const retry = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry });

		const first = runEntitlementBypass();
		await vi.waitFor(() => expect(finishRefresh).toBeDefined());
		const second = runEntitlementBypass();

		finishRefresh();
		await Promise.all([first, second]);

		expect(callMethodMock).toHaveBeenCalledOnce();
		expect(retry).toHaveBeenCalledOnce();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("holds the prompt open and busy until the retry settles", async () => {
		let finishRetry!: () => void;
		offerEntitlementBypass({
			reason: REASON,
			retry: () =>
				new Promise<void>((resolve) => {
					finishRetry = resolve;
				}),
		});

		const running = runEntitlementBypass();
		await vi.waitFor(() => expect(finishRetry).toBeDefined());
		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);

		finishRetry();
		await running;

		expect(entitlementBypassState.open).toBe(false);
		expect(entitlementBypassState.busy).toBe(false);
	});

	it("keeps offering a failure that arrives while it is running", async () => {
		let finishRetry!: () => void;
		const late = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({
			reason: REASON,
			retry: () =>
				new Promise<void>((resolve) => {
					finishRetry = resolve;
				}),
		});

		const running = runEntitlementBypass();
		await vi.waitFor(() => expect(finishRetry).toBeDefined());
		offerEntitlementBypass({ reason: "a later limit", retry: late });
		finishRetry();
		await running;

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(false);
		expect(entitlementBypassState.reason).toBe("a later limit");
		expect(late).not.toHaveBeenCalled();

		await runEntitlementBypass();
		expect(late).toHaveBeenCalledOnce();
		expect(entitlementBypassState.open).toBe(false);
	});

	it("abandons the retries when the account is signed out mid-run", async () => {
		const retry = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry });
		callMethodMock.mockImplementation(() => {
			clearAccountCaches();
			return Promise.resolve({ profileId: 1 });
		});

		await runEntitlementBypass();

		expect(retry).not.toHaveBeenCalled();
		expect(showErrorToastMock).not.toHaveBeenCalled();
		expect(entitlementBypassState.open).toBe(false);
	});

	it("reports a retry that fails again", async () => {
		offerEntitlementBypass({
			reason: REASON,
			retry: () => Promise.reject(new Error("still gated")),
		});

		await runEntitlementBypass();

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error: expect.anything(),
		});
		expect(entitlementBypassState.open).toBe(false);
	});

	it("reports a token reissue that fails", async () => {
		callMethodMock.mockRejectedValue(new Error("offline"));
		const retry = vi.fn(() => Promise.resolve());
		offerEntitlementBypass({ reason: REASON, retry });

		await runEntitlementBypass();

		expect(retry).not.toHaveBeenCalled();
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error: expect.anything(),
		});
	});
});
