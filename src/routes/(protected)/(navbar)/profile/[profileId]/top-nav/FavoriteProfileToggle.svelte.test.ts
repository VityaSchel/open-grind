// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { addFavoriteUserMock, removeFavoriteUserMock, showErrorToastMock } =
	vi.hoisted(() => ({
		addFavoriteUserMock: vi.fn(),
		removeFavoriteUserMock: vi.fn(),
		showErrorToastMock: vi.fn(),
	}));

vi.mock("$lib/api/users/favorites", () => ({
	addFavoriteUser: addFavoriteUserMock,
	removeFavoriteUser: removeFavoriteUserMock,
}));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import FavoriteProfileToggle from "./FavoriteProfileToggle.svelte";

const PROFILE_ID = 7;

const notFavorite = {
	isFavorite: false,
	name: "Add to favorites",
	request: addFavoriteUserMock,
	failureLabel: "Failed to add to favorites",
};

const favorite = {
	isFavorite: true,
	name: "Remove from favorites",
	request: removeFavoriteUserMock,
	failureLabel: "Failed to remove from favorites",
};

const states = [notFavorite, favorite];

function renderToggle({ isFavorite }: { isFavorite: boolean }) {
	const onFavorite = vi.fn();
	const { rerender } = render(FavoriteProfileToggle, {
		props: { profileId: PROFILE_ID, isFavorite, onFavorite },
	});
	return { rerender, onFavorite, toggle: screen.getByRole("switch") };
}

async function failToggle({
	toggle,
	request,
}: {
	toggle: HTMLElement;
	request: typeof addFavoriteUserMock;
}): Promise<Error> {
	const failure = new Error("offline");
	request.mockRejectedValueOnce(failure);
	await fireEvent.click(toggle);
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	addFavoriteUserMock.mockResolvedValue(undefined);
	removeFavoriteUserMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("FavoriteProfileToggle", () => {
	it.each(states)("names the switch $name", ({ isFavorite, name }) => {
		const { toggle } = renderToggle({ isFavorite });

		expect(screen.getByRole("switch", { name, checked: isFavorite })).toBe(
			toggle,
		);
	});

	it("swaps the switch name each time the favorite is saved", async () => {
		const { rerender, onFavorite, toggle } = renderToggle({
			isFavorite: false,
		});
		onFavorite.mockImplementation((isFavorite: boolean) =>
			rerender({ isFavorite }),
		);
		const names = [toggle.getAttribute("aria-label")];

		for (let saves = 1; saves <= states.length; saves += 1) {
			await fireEvent.click(toggle);
			await vi.waitFor(() => {
				expect(onFavorite).toHaveBeenCalledTimes(saves);
			});
			await tick();
			names.push(toggle.getAttribute("aria-label"));
		}

		expect(names).toEqual([
			notFavorite.name,
			favorite.name,
			notFavorite.name,
		]);
		expect(onFavorite.mock.calls).toEqual([[true], [false]]);
		for (const { request } of states) {
			expect(request).toHaveBeenCalledExactlyOnceWith({
				profileId: PROFILE_ID,
			});
		}
	});

	it.each(states)(
		"toasts $failureLabel when the change fails",
		async ({ isFavorite, request, failureLabel }) => {
			const { onFavorite, toggle } = renderToggle({ isFavorite });

			const failure = await failToggle({ toggle, request });

			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: failureLabel,
				error: failure,
			});
			expect(onFavorite).not.toHaveBeenCalled();
		},
	);

	it.each(states)(
		"words the switch $name and its failure in the active locale",
		async ({ isFavorite, request }) => {
			const { toggle } = renderToggle({ isFavorite });

			await setLocale({ locale: "en-XA" });
			await failToggle({ toggle, request });

			expect(toggle.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
			expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
				PSEUDO_MESSAGE,
			);
		},
	);
});
