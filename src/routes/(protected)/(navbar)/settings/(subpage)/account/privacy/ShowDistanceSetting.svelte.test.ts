// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const preferences = vi.hoisted(() => ({ units: "metric" }));

vi.mock("$lib/app-data/preferences.svelte", () => ({
	preferencesSnapshot: () => preferences,
}));
vi.mock("$lib/api/users/profiles", () => ({
	getProfile: () => Promise.resolve({ showDistance: true }),
	patchOwnProfile: () => Promise.resolve(),
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));

import ShowDistanceSetting from "./ShowDistanceSetting.svelte";

afterEach(() => {
	cleanup();
	preferences.units = "metric";
});

describe("ShowDistanceSetting", () => {
	it("gives its example distance in kilometres when metric is chosen", () => {
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });

		expect(screen.getByText(/e\.g\. 2\.4 km\.$/)).toBeTruthy();
	});

	it("gives its example distance in miles when imperial is chosen", () => {
		preferences.units = "imperial";
		render(ShowDistanceSetting, { props: { ourProfileId: 1 } });

		expect(screen.getByText(/e\.g\. 1\.5 mi\.$/)).toBeTruthy();
		expect(screen.queryByText(/km/)).toBeNull();
	});
});
