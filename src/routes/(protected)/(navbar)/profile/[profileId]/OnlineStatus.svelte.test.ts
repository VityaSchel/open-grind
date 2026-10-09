// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { formatRelativeTime } from "$lib/i18n/format";
import OnlineStatus from "./OnlineStatus.svelte";

const NOW = new Date(2026, 9, 9, 12).getTime();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const FIVE_MINUTES_AGO = NOW - 5 * MINUTE;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});

afterEach(async () => {
	cleanup();
	vi.useRealTimers();
	await setLocale({ locale: SOURCE_LOCALE });
});

const statusText = (container: Element) => container.textContent.trim();

const states = [
	{
		state: "online",
		props: { onlineUntil: NOW + MINUTE, seen: FIVE_MINUTES_AGO },
		status: "Online now",
	},
	{
		state: "self",
		props: { onlineUntil: null, seen: null, self: true },
		status: "Online now",
	},
	{
		state: "last seen",
		props: { onlineUntil: NOW - MINUTE, seen: FIVE_MINUTES_AGO },
		status: "Online 5 minutes ago",
	},
	{
		state: "seen over a thousand years ahead",
		props: { onlineUntil: null, seen: NOW + 1002 * 365 * DAY },
		status: "Online in 1002 years",
	},
	{
		state: "never seen",
		props: { onlineUntil: null, seen: null },
		status: "Offline",
	},
];

describe("OnlineStatus", () => {
	it.each(states)("shows $status when $state", ({ props, status }) => {
		const { container } = render(OnlineStatus, props);

		expect(statusText(container)).toBe(status);
	});

	it("keeps the time since last seen current", async () => {
		const { container } = render(OnlineStatus, {
			onlineUntil: null,
			seen: FIVE_MINUTES_AGO,
		});

		await vi.advanceTimersByTimeAsync(MINUTE);

		expect(statusText(container)).toBe("Online 6 minutes ago");
	});

	it.each(states)(
		"words the status in the active locale when $state",
		async ({ props }) => {
			const { container } = render(OnlineStatus, props);

			await setLocale({ locale: "en-XA" });

			expect(statusText(container)).toMatch(PSEUDO_MESSAGE);
		},
	);

	it("formats the time since last seen for the active locale", async () => {
		const { container } = render(OnlineStatus, {
			onlineUntil: null,
			seen: FIVE_MINUTES_AGO,
		});

		await setLocale({ locale: "en-XA" });

		expect(statusText(container)).toContain(
			formatRelativeTime({ date: FIVE_MINUTES_AGO, baseDate: NOW }),
		);
	});
});
