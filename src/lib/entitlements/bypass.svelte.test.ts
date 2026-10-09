import { beforeEach, describe, expect, it, vi } from "vitest";

const { holdInHondurasMock, showErrorToastMock, toastMock, preferencesMock } =
	vi.hoisted(() => ({
		holdInHondurasMock: vi.fn(),
		showErrorToastMock: vi.fn(),
		toastMock: { error: vi.fn() },
		preferencesMock: vi.fn(),
	}));

vi.mock("svelte-sonner", () => ({ toast: toastMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: preferencesMock,
}));
vi.mock("./honduras-hold", () => ({ holdInHonduras: holdInHondurasMock }));

import { clearAccountCaches } from "$lib/api/account-caches";
import {
	dismissEntitlementBypass,
	entitlementBypassState,
	offerEntitlementBypass,
	reportRefusedDespiteBypass,
	runEntitlementBypass,
} from "./bypass.svelte";
import type { LocationLease } from "./honduras-hold";

const HOME = "u33dc0cpnp0m";
const REASON = "Unsending a message requires a Grindr subscription.";

function fakeHold() {
	const ended = Promise.withResolvers<void>();
	let holders = 0;
	const lease = vi.fn((): LocationLease => {
		holders += 1;
		let holding = true;
		return {
			release: vi.fn(() => {
				if (holding) {
					holding = false;
					holders -= 1;
					if (holders === 0) ended.resolve();
				}
				return Promise.resolve();
			}),
		};
	});
	return { hold: { lease, ended: ended.promise }, end: ended.resolve };
}

async function granted(offer: Promise<LocationLease | null>) {
	const lease = await offer;
	if (lease === null) throw new Error("expected a lease");
	return lease;
}

beforeEach(() => {
	vi.clearAllMocks();
	preferencesMock.mockReturnValue({ geohash: HOME });
	holdInHondurasMock.mockImplementation(() =>
		Promise.resolve(fakeHold().hold),
	);
	dismissEntitlementBypass();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("offerEntitlementBypass", () => {
	it("opens the prompt with the caller's reason", () => {
		void offerEntitlementBypass({ reason: REASON });

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.reason).toBe(REASON);
		expect(entitlementBypassState.busy).toBe(false);
	});

	it("puts a batch of failures behind one prompt and one hold", async () => {
		const first = offerEntitlementBypass({ reason: REASON });
		const second = offerEntitlementBypass({ reason: "another feature" });
		expect(entitlementBypassState.reason).toBe(REASON);

		const running = runEntitlementBypass();
		const leases = await Promise.all([granted(first), granted(second)]);
		await Promise.all(leases.map((lease) => lease.release()));
		await running;

		expect(holdInHondurasMock).toHaveBeenCalledExactlyOnceWith({
			home: HOME,
		});
	});
});

describe("dismissEntitlementBypass", () => {
	it("answers every queued request with no lease and closes the prompt", async () => {
		const first = offerEntitlementBypass({ reason: REASON });
		const second = offerEntitlementBypass({ reason: REASON });

		dismissEntitlementBypass();

		await expect(first).resolves.toBeNull();
		await expect(second).resolves.toBeNull();
		expect(entitlementBypassState.open).toBe(false);
	});

	it("spoofs nothing when Bypass comes after the queue was dropped", async () => {
		void offerEntitlementBypass({ reason: REASON });
		dismissEntitlementBypass();

		await runEntitlementBypass();

		expect(holdInHondurasMock).not.toHaveBeenCalled();
	});

	it("drops the queued requests when the account is reset", async () => {
		const offer = offerEntitlementBypass({ reason: REASON });

		clearAccountCaches();

		await expect(offer).resolves.toBeNull();
		expect(entitlementBypassState.open).toBe(false);
	});
});

describe("runEntitlementBypass", () => {
	it("refuses to spoof when there is no location to come back to", async () => {
		preferencesMock.mockReturnValue({ geohash: null });
		const offer = offerEntitlementBypass({ reason: REASON });

		await runEntitlementBypass();

		await expect(offer).resolves.toBeNull();
		expect(holdInHondurasMock).not.toHaveBeenCalled();
		expect(entitlementBypassState.open).toBe(false);
		expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(
			"Set your location before using this bypass",
			{ id: "entitlement-bypass" },
		);
	});

	it("holds the prompt open and busy until every lease is released", async () => {
		const first = offerEntitlementBypass({ reason: REASON });
		const second = offerEntitlementBypass({ reason: REASON });

		const running = runEntitlementBypass();
		const [firstLease, secondLease] = await Promise.all([
			granted(first),
			granted(second),
		]);
		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);

		await firstLease.release();
		await Promise.resolve();
		expect(entitlementBypassState.busy).toBe(true);

		await secondLease.release();
		await running;
		expect(entitlementBypassState.busy).toBe(false);
		expect(entitlementBypassState.open).toBe(false);
	});

	it("closes the prompt when the hold ends before the lease is released", async () => {
		const { hold, end } = fakeHold();
		holdInHondurasMock.mockResolvedValue(hold);
		const offer = offerEntitlementBypass({ reason: REASON });

		const running = runEntitlementBypass();
		await granted(offer);
		end();
		await running;

		expect(entitlementBypassState.busy).toBe(false);
		expect(entitlementBypassState.open).toBe(false);
	});

	it("reports a failed handover once and answers every request with no lease", async () => {
		const failure = new Error("offline");
		holdInHondurasMock.mockRejectedValue(failure);
		const first = offerEntitlementBypass({ reason: REASON });
		const second = offerEntitlementBypass({ reason: REASON });

		await runEntitlementBypass();

		await expect(first).resolves.toBeNull();
		await expect(second).resolves.toBeNull();
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error: failure,
			id: "entitlement-bypass",
		});
		expect(entitlementBypassState.open).toBe(false);
		expect(entitlementBypassState.busy).toBe(false);
	});

	it("answers no lease quietly when the account signed out mid-handover", async () => {
		holdInHondurasMock.mockResolvedValue(null);
		const offer = offerEntitlementBypass({ reason: REASON });

		await runEntitlementBypass();

		await expect(offer).resolves.toBeNull();
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("ignores a second tap while a bypass runs", async () => {
		const offer = offerEntitlementBypass({ reason: REASON });
		const running = runEntitlementBypass();
		const lease = await granted(offer);
		let lateAnswered = false;
		void offerEntitlementBypass({ reason: "a later limit" }).then(() => {
			lateAnswered = true;
		});

		await runEntitlementBypass();

		expect(entitlementBypassState.busy).toBe(true);
		expect(entitlementBypassState.open).toBe(true);
		expect(holdInHondurasMock).toHaveBeenCalledOnce();
		await lease.release();
		await running;
		expect(lateAnswered).toBe(false);
	});

	it("keeps offering a failure that arrives while it is running", async () => {
		const first = offerEntitlementBypass({ reason: REASON });
		const running = runEntitlementBypass();
		const lease = await granted(first);

		const late = offerEntitlementBypass({ reason: "a later limit" });
		await lease.release();
		await running;

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(false);
		expect(entitlementBypassState.reason).toBe("a later limit");
		expect(holdInHondurasMock).toHaveBeenCalledOnce();

		const second = runEntitlementBypass();
		await (await granted(late)).release();
		await second;
		expect(holdInHondurasMock).toHaveBeenCalledTimes(2);
		expect(entitlementBypassState.open).toBe(false);
	});
});

describe("reportRefusedDespiteBypass", () => {
	it("reports a refused retry under the bypass toast", () => {
		const refusal = new Error("still gated");

		reportRefusedDespiteBypass(refusal);

		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error: refusal,
			id: "entitlement-bypass",
		});
		expect(console.error).toHaveBeenCalledWith(
			"Entitlement bypass failed: the action was still refused",
			refusal,
		);
	});
});
