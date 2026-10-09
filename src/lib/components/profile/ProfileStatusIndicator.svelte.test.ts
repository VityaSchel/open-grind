// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ProfileStatusIndicator from "./ProfileStatusIndicator.svelte";

const TICK_MS = 30_000;

const statuses = [
	{ online: true, isVisiting: true, status: "Online now. Visiting" },
	{ online: true, isVisiting: false, status: "Online now" },
	{ online: false, isVisiting: true, status: "Visiting" },
];

function renderStatus({
	online,
	isVisiting,
}: {
	online: boolean;
	isVisiting: boolean;
}) {
	render(ProfileStatusIndicator, {
		onlineUntil: online ? Date.now() + TICK_MS : null,
		isVisiting,
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_000_000);
});

afterEach(async () => {
	cleanup();
	vi.useRealTimers();
	await setLocale({ locale: SOURCE_LOCALE });
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
		render(ProfileStatusIndicator, {
			onlineUntil: null,
			isVisiting: false,
		});

		expect(screen.queryByTitle("Online now")).toBeNull();
	});

	it.each(statuses)("titles and announces $status", (row) => {
		renderStatus(row);

		expect(screen.getByTitle(row.status).textContent.trim()).toBe(
			row.status,
		);
	});

	it.each(statuses)("words $status in the active locale", async (row) => {
		renderStatus(row);

		await setLocale({ locale: "en-XA" });

		const indicator = screen.getByTitle(PSEUDO_MESSAGE);
		expect(indicator.textContent.trim()).toBe(indicator.title);
	});
});
