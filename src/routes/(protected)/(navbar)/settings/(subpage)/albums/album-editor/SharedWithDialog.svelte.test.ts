// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/api/messaging/albums", () => ({
	getAlbumShares: () => Promise.resolve({ profileIds: [] }),
}));
vi.mock("$app/navigation", () => ({ beforeNavigate: vi.fn() }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { slot } from "$lib/i18n/fixtures/dom";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { AlbumSharedWith } from "./shared-with-state.svelte";
import SharedWithDialog from "./SharedWithDialog.svelte";

async function openDialog(): Promise<HTMLElement> {
	render(SharedWithDialog, {
		props: {
			open: true,
			shares: new AlbumSharedWith({ albumId: 900, sharedCount: 0 }),
		},
	});
	await screen.findByText("Not shared yet");
	return screen.getByRole("dialog");
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("shared with dialog", () => {
	it("names itself after its list and says when nobody has the album", async () => {
		const dialog = await openDialog();

		expect(screen.getByRole("dialog", { name: "Shared With" })).toBe(
			dialog,
		);
		expect(slot("empty-description").textContent.trim()).toBe(
			"People you share this album with appear here.",
		);
	});

	it("words its title and empty state in the active locale", async () => {
		const dialog = await openDialog();

		await setLocale({ locale: "en-XA" });

		expect(screen.getByRole("dialog", { name: PSEUDO_MESSAGE })).toBe(
			dialog,
		);
		for (const name of ["empty-title", "empty-description"]) {
			expect(slot(name).textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});
});
