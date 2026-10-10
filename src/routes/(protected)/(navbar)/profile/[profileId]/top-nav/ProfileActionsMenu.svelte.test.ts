// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	reportSheetMock,
	blockUserMock,
	hideUserMock,
	showErrorToastMock,
	toastSuccessMock,
	writeTextMock,
} = vi.hoisted(() => ({
	reportSheetMock: vi.fn(),
	blockUserMock: vi.fn(),
	hideUserMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	writeTextMock: vi.fn(),
}));

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/browse/hides", () => ({ hideUser: hideUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("svelte-sonner", () => ({ toast: { success: toastSuccessMock } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

const PROFILE_ID = 100001;
const ITEMS = ["Copy profile ID", "Report user", "Hide user", "Block user"];

const failures = [
	{
		item: "Copy profile ID",
		request: writeTextMock,
		label: "Couldn’t copy profile ID",
	},
	{ item: "Hide user", request: hideUserMock, label: "Couldn’t hide" },
	{ item: "Block user", request: blockUserMock, label: "Couldn’t block" },
];

function renderMenu({ blockable }: { blockable: boolean }) {
	const pending = () => ({ revert: vi.fn(), settle: vi.fn() });
	render(ProfileActionsMenu, {
		props: {
			profileId: PROFILE_ID,
			blockable,
			changingViewability: false,
			markBlocked: pending,
			markHidden: pending,
		},
	});
	return screen.getByRole("button");
}

async function openMenu(): Promise<HTMLElement[]> {
	await fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
	return screen.findAllByRole("menuitem", { hidden: true });
}

async function choose(item: string) {
	const chosen = (await openMenu())[ITEMS.indexOf(item)];
	if (chosen === undefined) throw new Error(`no ${item} item`);
	await fireEvent.click(chosen);
}

async function fail({
	item,
	request,
}: {
	item: string;
	request: typeof writeTextMock;
}): Promise<Error> {
	const failure = new Error("offline");
	request.mockRejectedValueOnce(failure);
	await choose(item);
	await vi.waitFor(() => {
		expect(showErrorToastMock).toHaveBeenCalledOnce();
	});
	return failure;
}

async function copyId() {
	await choose("Copy profile ID");
	await vi.waitFor(() => {
		expect(toastSuccessMock).toHaveBeenCalledOnce();
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	writeTextMock.mockResolvedValue(undefined);
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

it("settles a block the report sheet has already sent instead of leaving it in flight", () => {
	const blocking = { revert: vi.fn(), settle: vi.fn() };
	const markBlocked = vi.fn(() => blocking);
	render(ProfileActionsMenu, {
		props: {
			profileId: PROFILE_ID,
			blockable: true,
			changingViewability: false,
			markBlocked,
			markHidden: vi.fn(),
		},
	});
	const [, reportSheet] = reportSheetMock.mock.lastCall as [
		unknown,
		{ onBlocked: () => void },
	];

	reportSheet.onBlocked();

	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(blocking.revert).not.toHaveBeenCalled();
});

describe("ProfileActionsMenu wording", () => {
	it("names the trigger Profile menu", () => {
		const trigger = renderMenu({ blockable: true });

		expect(screen.getByRole("button", { name: "Profile menu" })).toBe(
			trigger,
		);
	});

	it.each([
		{ blockable: true, items: ITEMS },
		{ blockable: false, items: ITEMS.slice(0, -1) },
	])(
		"lists $items when blockable is $blockable",
		async ({ blockable, items }) => {
			renderMenu({ blockable });

			const shown = await openMenu();

			expect(shown.map((item) => item.textContent.trim())).toEqual(items);
		},
	);

	it("copies the profile ID and says so", async () => {
		renderMenu({ blockable: true });

		await copyId();

		expect(writeTextMock).toHaveBeenCalledExactlyOnceWith(
			String(PROFILE_ID),
		);
		expect(toastSuccessMock).toHaveBeenCalledExactlyOnceWith(
			"Profile ID copied to clipboard",
		);
	});

	it.each(failures)(
		"toasts $label when $item fails",
		async ({ item, request, label }) => {
			renderMenu({ blockable: true });

			const failure = await fail({ item, request });

			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label,
				error: failure,
			});
		},
	);

	it("words the trigger and the items in the active locale", async () => {
		const trigger = renderMenu({ blockable: true });

		await setLocale({ locale: "en-XA" });
		const shown = await openMenu();

		expect(trigger.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(shown).toHaveLength(ITEMS.length);
		for (const item of shown) {
			expect(item.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});

	it("words the copy toast in the active locale", async () => {
		renderMenu({ blockable: true });

		await setLocale({ locale: "en-XA" });
		await copyId();

		expect(toastSuccessMock.mock.lastCall?.[0]).toMatch(PSEUDO_MESSAGE);
	});

	it.each(failures)(
		"words the $item failure in the active locale",
		async ({ item, request }) => {
			renderMenu({ blockable: true });

			await setLocale({ locale: "en-XA" });
			await fail({ item, request });

			expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
				PSEUDO_MESSAGE,
			);
		},
	);
});
