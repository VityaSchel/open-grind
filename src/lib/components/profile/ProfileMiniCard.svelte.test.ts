// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfileMiniCard from "./ProfileMiniCard.svelte";

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("ProfileMiniCard", () => {
	it("shows the online indicator for a profile without a display name", () => {
		render(ProfileMiniCard, {
			displayName: null,
			onlineUntil: Date.now() + 60_000,
			href: "/profile/1",
		});

		expect(screen.getByTitle("Online now")).toBeTruthy();
		expect(screen.getByText("Someone")).toBeTruthy();
	});

	it("names the profile when it has a display name", () => {
		render(ProfileMiniCard, { displayName: "Simon", href: "/profile/1" });

		expect(screen.getByText("Simon")).toBeTruthy();
		expect(screen.queryByText("Someone")).toBeNull();
		expect(screen.getByRole("link").getAttribute("aria-label")).toBeNull();
	});

	it("shows unread messages for a profile without a display name", () => {
		render(ProfileMiniCard, {
			displayName: null,
			unread: 3,
			href: "/profile/1",
		});

		expect(screen.getByText("3")).toBeTruthy();
	});

	it("keeps an anonymous card unlabeled", () => {
		render(ProfileMiniCard, { anonymous: true, href: "/profile/1" });

		expect(screen.queryByText("Someone")).toBeNull();
		expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
	});
});
