// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";

const {
	callMethodMock,
	reconnectMock,
	showErrorToastMock,
	updateLocationMock,
	preferencesMock,
	HONDURAS_GEOHASH,
} = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	reconnectMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	updateLocationMock: vi.fn(),
	preferencesMock: vi.fn(),
	HONDURAS_GEOHASH: "d4b1hqtcyz1k",
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/api/methods", () => ({ callMethod: callMethodMock }));
vi.mock("$lib/ws.svelte", () => ({ ws: { reconnect: reconnectMock } }));
vi.mock("$lib/entitlements/honduras", () => ({
	randomHondurasGeohash: () => HONDURAS_GEOHASH,
}));
vi.mock("$lib/api/browse/location", () => ({
	updateLocation: updateLocationMock,
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
const { setLocale, SOURCE_LOCALE } = await import("$lib/i18n");

const REASON_KEY = "chat.conversation.bypassReason.unsend";
const REASON = "Unsending a message requires a Grindr subscription.";

const bypassButton = () => screen.getByRole("button", { name: "Bypass" });
const cancelButton = () => screen.getByRole("button", { name: "Cancel" });

function description(): HTMLElement {
	const node = screen
		.getByRole("alertdialog")
		.querySelector<HTMLElement>('[data-slot="alert-dialog-description"]');
	if (node === null) throw new Error("no dialog description");
	return node;
}

async function offer(retry = vi.fn(() => Promise.resolve())) {
	offerEntitlementBypass({ reason: REASON_KEY, retry });
	await vi.waitFor(bypassButton);
	return retry;
}

async function startBypassThatHangs() {
	let finishRetry!: () => void;
	await offer(
		vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishRetry = resolve;
				}),
		),
	);
	await fireEvent.click(bypassButton());
	await vi.waitFor(() => expect(finishRetry).toBeDefined());
	return finishRetry;
}

describe("EntitlementBypassAlert", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		callMethodMock.mockResolvedValue({ profileId: 1 });
		reconnectMock.mockResolvedValue(undefined);
		updateLocationMock.mockResolvedValue(undefined);
		preferencesMock.mockReturnValue({ geohash: "u33dc0cpnp0m" });
		render(EntitlementBypassAlert);
	});

	afterEach(async () => {
		cleanup();
		dismissEntitlementBypass();
		await setLocale({ locale: SOURCE_LOCALE });
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

	it("explains the bypass in one sentence that links the guide", async () => {
		await offer();

		expect(description().textContent).toBe(
			`${REASON} Open Grind can attempt to bypass this by momentarily spoofing your geolocation to Honduras. Learn more.`,
		);
		expect(
			within(description()).getByRole("link", { name: "Learn more" }),
		).toBeTruthy();
	});

	it("shows the reason in the active locale", async () => {
		await offer();
		const reason = screen.getByText(REASON);

		await setLocale({ locale: "en-XA" });

		await vi.waitFor(() => expect(screen.queryByText(REASON)).toBeNull());
		expect(reason.textContent).toMatch(PSEUDO_MESSAGE);
	});

	it("words the prompt in the active locale", async () => {
		await offer();
		const title = screen.getByText("Paid feature");
		const buttons = [cancelButton(), bypassButton()];
		const href = within(description())
			.getByRole("link", { name: "Learn more" })
			.getAttribute("href");

		await setLocale({ locale: "en-XA" });

		const explanation = [...description().childNodes]
			.filter((node) => node.nodeName !== "P")
			.map((node) => node.textContent)
			.join("")
			.trim();
		const lines = [
			title.textContent,
			explanation,
			...buttons.map((button) => button.textContent),
		];
		for (const line of lines) expect(line).toMatch(PSEUDO_MESSAGE);
		const link = within(description()).getByRole("link");
		expect(link.getAttribute("href")).toBe(href);
		expect(link.textContent).not.toBe("Learn more");
		expect(explanation).toContain(link.textContent);
	});

	it("reissues the token and replays the action on Bypass", async () => {
		const retry = await offer();

		await fireEvent.click(bypassButton());
		await vi.waitFor(() => expect(retry).toHaveBeenCalledOnce());

		expect(callMethodMock).toHaveBeenCalledWith("refresh_session", {
			geohash: HONDURAS_GEOHASH,
		});
		expect(showErrorToastMock).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
	});

	it("locks both buttons while the bypass is in flight", async () => {
		const finishRetry = await startBypassThatHangs();

		expect(bypassButton().matches(":disabled")).toBe(true);
		expect(cancelButton().matches(":disabled")).toBe(true);

		finishRetry();
		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
	});

	it("keeps Escape from canceling a bypass in flight", async () => {
		const finishRetry = await startBypassThatHangs();

		await fireEvent.keyDown(document, { key: "Escape" });

		expect(entitlementBypassState.open).toBe(true);
		finishRetry();
		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
	});

	it("swallows the back gesture instead of navigating while busy", async () => {
		const finishRetry = await startBypassThatHangs();

		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(entitlementBypassState.open).toBe(true);
		finishRetry();
		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
	});

	it("cancels the action on the back gesture", async () => {
		const retry = await offer();

		for (const handler of backGestureEventHandlers) handler();

		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
		expect(retry).not.toHaveBeenCalled();
	});

	it("cancels the action on Escape", async () => {
		const retry = await offer();

		await fireEvent.keyDown(document, { key: "Escape" });

		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
		expect(retry).not.toHaveBeenCalled();
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	it("cancels the action on Cancel", async () => {
		const retry = await offer();

		await fireEvent.click(cancelButton());

		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));
		expect(retry).not.toHaveBeenCalled();
		expect(callMethodMock).not.toHaveBeenCalled();
	});

	it("drops the queue on cancel so a later bypass cannot replay it", async () => {
		const retry = await offer();
		await fireEvent.click(cancelButton());
		await vi.waitFor(() => expect(entitlementBypassState.open).toBe(false));

		const later = await offer();
		await fireEvent.click(bypassButton());
		await vi.waitFor(() => expect(later).toHaveBeenCalledOnce());

		expect(retry).not.toHaveBeenCalled();
	});
});
