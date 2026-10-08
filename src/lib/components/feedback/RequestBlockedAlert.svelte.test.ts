// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
import { backGestureEventHandlers } from "$lib/platform/back-gesture-event.svelte";
import RequestBlockedAlert from "./RequestBlockedAlert.svelte";

const { callMethodMock, toastMock } = vi.hoisted(() => ({
	callMethodMock: vi.fn(),
	toastMock: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("$lib/api/methods", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/methods")>()),
	callMethod: callMethodMock,
}));
vi.mock("svelte-sonner", () => ({ toast: toastMock }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const rotateButton = () =>
	screen.getByRole("button", { name: "Rotate parameters" });
const closeButton = () => screen.getByRole("button", { name: "Close" });

async function startRotationThatHangs() {
	const rotation = Promise.withResolvers<void>();
	callMethodMock.mockReturnValueOnce(rotation.promise);
	render(RequestBlockedAlert);
	await fireEvent.click(rotateButton());
	return rotation.resolve;
}

describe("RequestBlockedAlert", () => {
	beforeEach(() => {
		callMethodMock
			.mockReset()
			.mockResolvedValue({
				"user-agent": "grindr",
				"l-device-info": "device",
			});
		toastMock.success.mockReset();
		requestBlockedAlertState.open = true;
		requestBlockedAlertState.disable = false;
		requestBlockedAlertState.kind = "cloudflare";
	});

	afterEach(() => {
		cleanup();
		requestBlockedAlertState.open = false;
		requestBlockedAlertState.kind = "cloudflare";
	});

	it("names Cloudflare and offers to rotate device parameters", () => {
		render(RequestBlockedAlert);

		expect(screen.getByText("Grindr blocks your requests")).toBeTruthy();
		expect(
			screen.getByText(/Cloudflare protecting the Grindr API/),
		).toBeTruthy();
		expect(screen.getByRole("link", { name: "known issue" })).toBeTruthy();
		expect(rotateButton()).toBeTruthy();
	});

	it("rotates device parameters and closes", async () => {
		render(RequestBlockedAlert);

		await fireEvent.click(rotateButton());
		await settle();

		expect(callMethodMock).toHaveBeenCalledWith("rotate_api_params");
		expect(toastMock.success).toHaveBeenCalled();
		expect(requestBlockedAlertState.open).toBe(false);
	});

	it("names both suspects without blaming the network outright", () => {
		requestBlockedAlertState.kind = "network";
		render(RequestBlockedAlert);

		expect(
			screen.getByText(
				"Something blocked the request before it reached Grindr",
			),
		).toBeTruthy();
		expect(screen.getByText(/captive portal/)).toBeTruthy();
		expect(
			screen.getByText(/edge in front of the Grindr API/),
		).toBeTruthy();
		expect(screen.queryByRole("link", { name: "known issue" })).toBeNull();
		expect(closeButton()).toBeTruthy();
	});

	it("keeps the rotate action on a block it cannot attribute", async () => {
		requestBlockedAlertState.kind = "network";
		render(RequestBlockedAlert);

		await fireEvent.click(rotateButton());
		await settle();

		expect(callMethodMock).toHaveBeenCalledWith("rotate_api_params");
		expect(requestBlockedAlertState.open).toBe(false);
	});

	it("keeps the session opt-out on both kinds", () => {
		requestBlockedAlertState.kind = "network";
		render(RequestBlockedAlert);

		expect(
			screen.getByLabelText("Don't show again in this session"),
		).toBeTruthy();
	});

	it("marks Rotate parameters busy and locks both buttons while rotating parameters", async () => {
		const finishRotation = await startRotationThatHangs();

		expect(rotateButton().getAttribute("aria-busy")).toBe("true");
		expect(rotateButton().matches(":disabled")).toBe(true);
		expect(closeButton().matches(":disabled")).toBe(true);

		finishRotation();
		await vi.waitFor(() =>
			expect(requestBlockedAlertState.open).toBe(false),
		);
	});

	it("keeps Escape and the back gesture from closing the dialog while rotating parameters", async () => {
		const finishRotation = await startRotationThatHangs();

		await fireEvent.keyDown(document, { key: "Escape" });
		expect(backGestureEventHandlers.size).toBe(1);
		for (const handler of backGestureEventHandlers) handler();

		expect(requestBlockedAlertState.open).toBe(true);
		finishRotation();
		await vi.waitFor(() =>
			expect(requestBlockedAlertState.open).toBe(false),
		);
	});

	it("closes on the back gesture without rotating parameters", () => {
		render(RequestBlockedAlert);

		for (const handler of backGestureEventHandlers) handler();

		expect(requestBlockedAlertState.open).toBe(false);
		expect(callMethodMock).not.toHaveBeenCalled();
	});
});
