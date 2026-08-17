// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestBlockedAlertState } from "$lib/api/request-blocked-state.svelte";
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
		expect(
			screen.getByRole("button", { name: "Rotate parameters" }),
		).toBeTruthy();
	});

	it("rotates device parameters and closes", async () => {
		render(RequestBlockedAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Rotate parameters" }),
		);
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
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
	});

	it("keeps the rotate action on a block it cannot attribute", async () => {
		requestBlockedAlertState.kind = "network";
		render(RequestBlockedAlert);

		await fireEvent.click(
			screen.getByRole("button", { name: "Rotate parameters" }),
		);
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
});
