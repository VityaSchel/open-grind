import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ run: vi.fn(), abortStale: vi.fn() }));
vi.mock("$lib/location/location-request.svelte", () => ({
	locationRequest: {
		run: mocks.run,
		abortStale: mocks.abortStale,
		generation: 1,
	},
}));
vi.mock("$lib/location/location-feedback", () => ({
	reportLocationFailure: vi.fn(),
}));

import LocateMeButton from "./LocateMeButton.svelte";

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it("cancels its GPS request on leaving and ignores a late result", async () => {
	let finish!: (outcome: unknown) => void;
	mocks.run.mockImplementation(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			}),
	);
	const onlocate = vi.fn();
	const { unmount } = render(LocateMeButton, { onlocate });
	await fireEvent.click(screen.getByRole("button", { name: "Locate me" }));
	unmount();
	expect(mocks.abortStale).toHaveBeenCalledExactlyOnceWith(1);
	finish({ status: "ok", coords: { lat: 52.52, lon: 13.405 } });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(onlocate).not.toHaveBeenCalled();
});
