import { cleanup, render } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { restoreStrandedLocationMock } = vi.hoisted(() => ({
	restoreStrandedLocationMock: vi.fn<() => Promise<void>>(),
}));

vi.mock("$lib/entitlements/honduras-hold", () => ({
	restoreStrandedLocation: restoreStrandedLocationMock,
}));
vi.mock("$lib/presence/online-heartbeat", () => ({
	startOnlineHeartbeat: () => () => {},
}));
vi.mock("$lib/util/media-retry-signals", () => ({
	retryBrokenMediaWhenOnline: () => () => {},
}));
vi.mock("$lib/components/command-center/CommandCenter.svelte", () => ({
	default: () => {},
}));

import ProtectedLayout from "./+layout.svelte";

const children = createRawSnippet(() => ({ render: () => "<p>page</p>" }));

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	cleanup();
});

describe("(protected) layout", () => {
	it("moves a profile left away from home back once the app opens", () => {
		restoreStrandedLocationMock.mockResolvedValue(undefined);

		render(ProtectedLayout, { props: { children } });

		expect(restoreStrandedLocationMock).toHaveBeenCalledOnce();
	});

	it("logs a repair that fails instead of leaving it unhandled", async () => {
		const failure = new Error("offline");
		restoreStrandedLocationMock.mockRejectedValue(failure);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		render(ProtectedLayout, { props: { children } });

		await vi.waitFor(() =>
			expect(consoleError).toHaveBeenCalledWith(
				"Could not move back from Honduras",
				failure,
			),
		);
		consoleError.mockRestore();
	});
});
