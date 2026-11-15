// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/api/current-session.ts", () => ({
	signedInProfileIdSnapshot: () => 858049792,
	signedInProfileId: () => Promise.resolve(858049792),
}));

import UserAvatar from "./UserAvatar.svelte";

const BROKEN = '[data-slot="broken-media"]';
const COVER = '[data-slot="mature-content-cover"]';

describe("UserAvatar on Google Play", () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	it("covers someone else's photo with an 18+ plane while it keeps loading underneath", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		const { container } = render(UserAvatar, {
			props: { mediaHash: "deadbeef" },
		});

		expect(container.querySelector(COVER)?.textContent?.trim()).toBe("18+");
		expect(screen.queryByRole("link")).toBeNull();
		expect(container.querySelector("img")?.src).toContain("deadbeef");
	});

	it("leaves our own photo uncovered", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		const { container } = render(UserAvatar, {
			props: { mediaHash: "deadbeef", own: true },
		});

		expect(container.querySelector(COVER)).toBeNull();
	});

	it("leaves the no-photo silhouette uncovered", () => {
		vi.stubEnv("OPEN_GRIND_STORE", "play");
		const { container } = render(UserAvatar, {
			props: { mediaHash: null },
		});

		expect(container.querySelector(COVER)).toBeNull();
	});
});

describe("UserAvatar on other builds", () => {
	afterEach(cleanup);

	it("never covers a photo", () => {
		const { container } = render(UserAvatar, {
			props: { mediaHash: "deadbeef" },
		});

		expect(container.querySelector(COVER)).toBeNull();
	});
});

describe("UserAvatar", () => {
	afterEach(cleanup);

	it("shows the no-photo branch, not the broken fallback, for a null hash", () => {
		const { container } = render(UserAvatar, {
			props: { mediaHash: null },
		});

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).toBeNull();
		expect(container.querySelector("svg")).not.toBeNull();
	});

	it("swaps a failing photo for the broken fallback", async () => {
		const { container } = render(UserAvatar, {
			props: { mediaHash: "deadbeef" },
		});

		const img = container.querySelector("img");
		expect(img?.src).toContain("deadbeef");

		await fireEvent.error(img!);

		expect(container.querySelector("img")).toBeNull();
		expect(container.querySelector(BROKEN)).not.toBeNull();
	});
});
