// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	HondurasHold,
	LocationLease,
} from "$lib/entitlements/honduras-hold";

const {
	holdInHondurasMock,
	showErrorToastMock,
	preferencesMock,
	HOME_GEOHASH,
} = vi.hoisted(() => ({
	holdInHondurasMock:
		vi.fn<(args: { home: string }) => Promise<HondurasHold | null>>(),
	showErrorToastMock: vi.fn(),
	preferencesMock: vi.fn(),
	HOME_GEOHASH: "u33dc0cpnp0m",
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/entitlements/honduras-hold", () => ({
	holdInHonduras: holdInHondurasMock,
}));
vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: preferencesMock,
}));

const {
	dismissEntitlementBypass,
	entitlementBypassState,
	offerEntitlementBypass,
} = await import("$lib/entitlements/bypass.svelte");
const { backGestureEventHandlers } =
	await import("$lib/platform/back-gesture-event.svelte");
const EntitlementBypassAlert = (await import("./EntitlementBypassAlert.svelte"))
	.default;

const REASON = "Unsending a message requires a Grindr subscription.";

type FakeHold = HondurasHold & { leases: LocationLease[] };

const holds: FakeHold[] = [];
let pendingGrant: ((hold: HondurasHold) => void) | null = null;

function createFakeHold(): FakeHold {
	const leases: LocationLease[] = [];
	let holders = 0;
	let markEnded!: () => void;
	const ended = new Promise<void>((resolve) => {
		markEnded = resolve;
	});
	return {
		leases,
		ended,
		lease: () => {
			holders += 1;
			let holding = true;
			const lease: LocationLease = {
				release: () => {
					if (holding) {
						holding = false;
						holders -= 1;
						if (holders === 0) markEnded();
					}
					return Promise.resolve();
				},
			};
			leases.push(lease);
			return lease;
		},
	};
}

function grantFakeHold(): Promise<FakeHold> {
	const hold = createFakeHold();
	holds.push(hold);
	return Promise.resolve(hold);
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const bypassButton = () => screen.getByRole("button", { name: "Bypass" });
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });

async function offer(): Promise<{ answer: Promise<LocationLease | null> }> {
	const answer = offerEntitlementBypass({ reason: REASON });
	await vi.waitFor(bypassButton);
	return { answer };
}

async function bypassAndHoldLease(): Promise<LocationLease> {
	const { answer } = await offer();
	await fireEvent.click(bypassButton());
	const lease = await answer;
	if (lease === null) throw new Error("expected a lease after Bypass");
	await settle();
	return lease;
}

async function expectDialogClosed(): Promise<void> {
	await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
	expect(entitlementBypassState.busy).toBe(false);
}

describe("EntitlementBypassAlert", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		holds.length = 0;
		holdInHondurasMock.mockImplementation(grantFakeHold);
		preferencesMock.mockReturnValue({ geohash: HOME_GEOHASH });
		render(EntitlementBypassAlert);
	});

	afterEach(async () => {
		try {
			if (pendingGrant !== null) {
				pendingGrant(await grantFakeHold());
				pendingGrant = null;
				await settle();
			}
			await Promise.all(
				holds.flatMap(({ leases }) =>
					leases.map(({ release }) => release()),
				),
			);
			await vi.waitFor(() =>
				expect(entitlementBypassState.busy).toBe(false),
			);
		} finally {
			dismissEntitlementBypass();
			cleanup();
			vi.restoreAllMocks();
		}
	});

	it("explains the paid feature and what the bypass does", async () => {
		await offer();

		expect(screen.getByText("Paid feature")).toBeTruthy();
		expect(screen.getByText(REASON)).toBeTruthy();
		expect(
			screen.getByText(
				/momentarily spoofing your geolocation to Honduras/,
			),
		).toBeTruthy();
		expect(screen.getByRole("link", { name: "Learn more" })).toHaveProperty(
			"href",
			"https://opengrind.org/guides/bypasses",
		);
	});

	it("hands the request a lease from a Honduras hold taken from the home location on Bypass", async () => {
		const { answer } = await offer();

		await fireEvent.click(bypassButton());

		const lease = await answer;
		expect(holdInHondurasMock).toHaveBeenCalledExactlyOnceWith({
			home: HOME_GEOHASH,
		});
		expect(lease).toBe(holds[0]?.leases[0]);
		expect(showErrorToastMock).not.toHaveBeenCalled();
	});

	it("keeps the dialog open and busy until the request releases its lease", async () => {
		const lease = await bypassAndHoldLease();

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);

		await lease.release();

		await expectDialogClosed();
	});

	it("marks Bypass busy and locks both buttons while the bypass is in flight", async () => {
		const lease = await bypassAndHoldLease();

		expect(bypassButton().getAttribute("aria-busy")).toBe("true");
		expect(bypassButton().matches(":disabled")).toBe(true);
		expect(cancelButton().matches(":disabled")).toBe(true);

		await lease.release();
		await expectDialogClosed();
	});

	it("locks both buttons while the profile is still moving to Honduras", async () => {
		holdInHondurasMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					pendingGrant = resolve;
				}),
		);
		const { answer } = await offer();

		await fireEvent.click(bypassButton());

		expect(holdInHondurasMock).toHaveBeenCalledOnce();
		expect(bypassButton().getAttribute("aria-busy")).toBe("true");
		expect(bypassButton().matches(":disabled")).toBe(true);
		expect(cancelButton().matches(":disabled")).toBe(true);

		const hold = await grantFakeHold();
		pendingGrant?.(hold);
		pendingGrant = null;
		const lease = await answer;
		expect(lease).toBe(hold.leases[0]);
	});

	it("keeps Escape from canceling a bypass in flight", async () => {
		const lease = await bypassAndHoldLease();

		await fireEvent.keyDown(document, { key: "Escape" });

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);
		await lease.release();
		await expectDialogClosed();
	});

	it("swallows the back gesture instead of navigating while busy", async () => {
		const lease = await bypassAndHoldLease();

		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);
		await lease.release();
		await expectDialogClosed();
	});

	it("hands every queued request a lease from one hold and stays busy until the last is released", async () => {
		const first = offerEntitlementBypass({ reason: REASON });
		const second = offerEntitlementBypass({ reason: "another feature" });
		await vi.waitFor(bypassButton);

		await fireEvent.click(bypassButton());
		const [firstLease, secondLease] = await Promise.all([first, second]);

		expect(holdInHondurasMock).toHaveBeenCalledOnce();
		expect(holds[0]?.leases).toEqual([firstLease, secondLease]);

		await firstLease?.release();
		await settle();
		expect(entitlementBypassState.open).toBe(true);
		expect(entitlementBypassState.busy).toBe(true);

		await secondLease?.release();
		await expectDialogClosed();
	});

	it("resolves the request with null and closes the dialog when the handover fails", async () => {
		const error = new Error("refresh_session refused");
		holdInHondurasMock.mockRejectedValueOnce(error);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { answer } = await offer();

		await fireEvent.click(bypassButton());

		await expect(answer).resolves.toBeNull();
		await expectDialogClosed();
		expect(consoleError).toHaveBeenCalledExactlyOnceWith(
			"Entitlement bypass failed: could not complete the handover",
			error,
		);
		expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
			label: "Failed to bypass this paid feature",
			error,
			id: "entitlement-bypass",
		});
	});

	it("cancels the action on the back gesture", async () => {
		const { answer } = await offer();

		for (const handler of backGestureEventHandlers) handler();

		await expect(answer).resolves.toBeNull();
		await expectDialogClosed();
		expect(holdInHondurasMock).not.toHaveBeenCalled();
	});

	it("cancels the action on Escape", async () => {
		const { answer } = await offer();

		await fireEvent.keyDown(document, { key: "Escape" });

		await expect(answer).resolves.toBeNull();
		await expectDialogClosed();
		expect(holdInHondurasMock).not.toHaveBeenCalled();
	});

	it("cancels the action on Cancel", async () => {
		const { answer } = await offer();

		await fireEvent.click(cancelButton());

		await expect(answer).resolves.toBeNull();
		await expectDialogClosed();
		expect(holdInHondurasMock).not.toHaveBeenCalled();
	});

	it("drops the queue on cancel so a later Bypass cannot hand a lease to the cancelled request", async () => {
		const cancelled = await offer();
		await fireEvent.click(cancelButton());
		await expect(cancelled.answer).resolves.toBeNull();
		await expectDialogClosed();

		const later = await offer();
		await fireEvent.click(bypassButton());
		const lease = await later.answer;

		expect(holdInHondurasMock).toHaveBeenCalledOnce();
		expect(holds[0]?.leases).toEqual([lease]);
	});
});
