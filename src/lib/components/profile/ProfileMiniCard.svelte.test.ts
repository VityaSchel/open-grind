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

	it.each([
		["HOSTING", "Right Now · Hosting"],
		["NOT_HOSTING", "Right Now"],
	] as const)(
		"marks a %s Right Now profile inside the name pill",
		(rightNow, title) => {
			const { container } = render(ProfileMiniCard, {
				displayName: "Simon",
				rightNow,
				href: "/profile/1",
			});

			const indicator = container.querySelector(
				'[data-slot="right-now-indicator"]',
			);
			expect(indicator?.getAttribute("title")).toBe(title);
			expect(indicator?.closest('[data-slot="badge"]')).not.toBeNull();
		},
	);

	it("marks no Right Now status by default", () => {
		const { container } = render(ProfileMiniCard, {
			displayName: "Simon",
			href: "/profile/1",
		});

		expect(
			container.querySelector('[data-slot="right-now-indicator"]'),
		).toBeNull();
	});
});
