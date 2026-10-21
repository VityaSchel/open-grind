// @vitest-environment jsdom

import { decode, encode } from "@msgpack/msgpack";
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeMock } = vi.hoisted(() => ({ writeMock: vi.fn() }));

vi.mock("$lib/app-data", () => ({
	existsAppDataFile: () => Promise.resolve(true),
	readAppDataFile: () => Promise.resolve(encode({})),
	removeAppDataFile: () => Promise.resolve(),
	writeAppDataFileAtomic: writeMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));

import {
	type BooleanPreference,
	setPreferences,
} from "$lib/app-data/preferences.svelte";
import PrivacyPage from "./+page.svelte";

const SWITCHES = [
	{ title: "Stay online while the app is open", preference: "stayOnline" },
	{ title: "Reveal message read status", preference: "revealMessageRead" },
	{ title: "Reveal profile views", preference: "revealProfileViews" },
	{ title: "Enable GIPHY", preference: "giphyConsent" },
] as const satisfies { title: string; preference: BooleanPreference }[];
const ALL_OFF = Object.fromEntries(
	SWITCHES.map(({ preference }) => [preference, false]),
);

function lastWritten(): Record<string, unknown> {
	const { content } = writeMock.mock.lastCall?.[0] as { content: Uint8Array };
	return decode(content) as Record<string, unknown>;
}

beforeEach(async () => {
	writeMock.mockReset().mockResolvedValue(undefined);
	await setPreferences(ALL_OFF);
	writeMock.mockClear();
});

afterEach(cleanup);

describe("the Privacy settings", () => {
	it("list the online status, read receipt, profile view and GIPHY switches under no headings", () => {
		render(PrivacyPage);

		expect(
			screen
				.getAllByRole("switch")
				.map((control) => control.getAttribute("aria-checked")),
		).toEqual(["false", "false", "false", "false"]);
		expect(
			SWITCHES.map(({ title }) =>
				screen
					.getAllByRole("switch")
					.indexOf(
						screen.getByRole("switch", {
							name: new RegExp(`^${title}`),
						}),
					),
			),
		).toEqual([0, 1, 2, 3]);
		expect(screen.queryAllByRole("heading")).toEqual([]);
	});

	it.each(SWITCHES)(
		"turns $preference on from the $title switch alone",
		async ({ title, preference }) => {
			render(PrivacyPage);

			await fireEvent.click(
				screen.getByRole("switch", { name: new RegExp(`^${title}`) }),
			);

			expect(writeMock).toHaveBeenCalledOnce();
			expect(lastWritten()).toMatchObject({
				...ALL_OFF,
				[preference]: true,
			});
		},
	);
});
