// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfileStatusIndicator from "./ProfileStatusIndicator.svelte";

const TICK_MS = 30_000;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe("ProfileStatusIndicator", () => {
	it("goes offline once the online window elapses", async () => {
		render(ProfileStatusIndicator, {
			onlineUntil: Date.now() + TICK_MS / 2,
			isVisiting: false,
		});

		expect(screen.getByTitle("Online now")).toBeTruthy();

		await vi.advanceTimersByTimeAsync(TICK_MS);

		expect(screen.queryByTitle("Online now")).toBeNull();
	});

	it("stays online while the window has not elapsed", async () => {
		render(ProfileStatusIndicator, {
			onlineUntil: Date.now() + TICK_MS * 10,
			isVisiting: false,
		});

		await vi.advanceTimersByTimeAsync(TICK_MS);

		expect(screen.getByTitle("Online now")).toBeTruthy();
	});

	it("is offline without an online timestamp", () => {
		render(ProfileStatusIndicator, { onlineUntil: null, isVisiting: false });

		expect(screen.queryByTitle("Online now")).toBeNull();
	});
});
