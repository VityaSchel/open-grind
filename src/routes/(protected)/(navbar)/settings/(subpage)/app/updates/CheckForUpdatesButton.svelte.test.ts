// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { checks } = vi.hoisted(() => ({
	checks: {
		checkForUpdatesNow:
			vi.fn<
				(scope: {
					selfManaged: boolean;
					addonAvailable: boolean;
				}) => Promise<void>
			>(),
	},
}));

vi.mock("$lib/updates/update-checks", () => checks);

import CheckForUpdatesButton from "./CheckForUpdatesButton.svelte";

function action() {
	return screen.getByRole("button", { name: "Check for updates" });
}

function spinner() {
	return screen.queryByRole("status", { hidden: true });
}

describe("CheckForUpdatesButton", () => {
	let finish: () => void = () => {};

	beforeEach(() => {
		checks.checkForUpdatesNow.mockReset().mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
	});

	afterEach(cleanup);

	it("checks what this build can update", async () => {
		render(CheckForUpdatesButton, {
			selfManaged: false,
			addonAvailable: true,
		});

		await fireEvent.click(action());

		expect(checks.checkForUpdatesNow).toHaveBeenCalledExactlyOnceWith({
			selfManaged: false,
			addonAvailable: true,
		});
	});

	it("spins and refuses taps until its checks finish", async () => {
		render(CheckForUpdatesButton, {
			selfManaged: true,
			addonAvailable: true,
		});
		expect(spinner()).toBeNull();
		expect(action().getAttribute("aria-busy")).toBe("false");

		await fireEvent.click(action());

		expect(action().hasAttribute("disabled")).toBe(true);
		expect(action().getAttribute("aria-busy")).toBe("true");
		expect(spinner()).not.toBeNull();
		expect(screen.queryByRole("status")).toBeNull();
		await fireEvent.click(action());
		expect(checks.checkForUpdatesNow).toHaveBeenCalledOnce();

		finish();
		await vi.waitFor(() =>
			expect(action().hasAttribute("disabled")).toBe(false),
		);
		expect(spinner()).toBeNull();
	});
});
