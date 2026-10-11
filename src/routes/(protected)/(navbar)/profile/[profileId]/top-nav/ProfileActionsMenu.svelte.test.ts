// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	reportSheetMock,
	blockUserMock,
	hideUserMock,
	showErrorToastMock,
	showBlockFailureMock,
	toastSuccessMock,
	writeTextMock,
} = vi.hoisted(() => ({
	reportSheetMock: vi.fn(),
	blockUserMock: vi.fn<() => Promise<void>>(),
	hideUserMock: vi.fn(),
	showErrorToastMock: vi.fn(),
	showBlockFailureMock: vi.fn(),
	toastSuccessMock: vi.fn(),
	writeTextMock: vi.fn(),
}));

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/browse/hides", () => ({ hideUser: hideUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/components/report/block-failure", () => ({
	showBlockFailure: showBlockFailureMock,
}));
vi.mock("svelte-sonner", () => ({ toast: { success: toastSuccessMock } }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
	writeText: writeTextMock,
}));

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import { applyBackGestureHandler } from "$lib/platform/android-native-bridge";
import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

const PROFILE_ID = 100010;
const ITEMS = ["Copy profile ID", "Report user", "Hide user", "Block user"];

const failures = [
	{
		item: "Copy profile ID",
		request: writeTextMock,
		label: "Couldn’t copy profile ID",
	},
	{ item: "Hide user", request: hideUserMock, label: "Couldn’t hide" },
];

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const backHandledInApp = () => window.__AndroidOnBackGesture?.() === false;

function renderMenu() {
	const blocking = { revert: vi.fn(), settle: vi.fn() };
	const markBlocked = vi.fn(() => blocking);
	render(ProfileActionsMenu, {
		props: {
			profileId: PROFILE_ID,
			changingViewability: false,
			markBlocked,
			markHidden: () => ({ revert: vi.fn(), settle: vi.fn() }),
		},
	});
	return { trigger: screen.getByRole("button"), blocking, markBlocked };
}

function reportSheetProps() {
	const [, props] = reportSheetMock.mock.lastCall as [
		unknown,
		{ onBlock: () => void },
	];
	return props;
}

async function openMenu(): Promise<HTMLElement[]> {
	await fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
	return screen.findAllByRole("menuitem", { hidden: true });
}

async function menuItem(item: string): Promise<HTMLElement> {
	const found = (await openMenu())[ITEMS.indexOf(item)];
	if (found === undefined) throw new Error(`no ${item} item`);
	return found;
}

async function choose(item: string) {
	await fireEvent.click(await menuItem(item));
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
	blockUserMock.mockResolvedValue(undefined);
	applyBackGestureHandler();
});

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await setLocale({ locale: SOURCE_LOCALE });
});

it("shows the profile as blocked at once and settles once the block is confirmed", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderMenu();

	const item = await menuItem("Block user");
	expect(item.textContent.trim()).toBe("Block user");
	expect(item.getAttribute("aria-disabled")).not.toBe("true");
	await fireEvent.click(item);
	await flush();
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();

	block.resolve();
	await flush();

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(showBlockFailureMock).not.toHaveBeenCalled();
});

it("brings the profile back and explains a block that did not stick", async () => {
	const rejection = new Error("not listed");
	blockUserMock.mockRejectedValueOnce(rejection);
	const { blocking } = renderMenu();

	await choose("Block user");
	await flush();

	expect(blocking.revert).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();
	expect(showBlockFailureMock).toHaveBeenCalledExactlyOnceWith(rejection);
	expect(showErrorToastMock).not.toHaveBeenCalled();
});

it("shows a block from the report sheet at once and settles it once confirmed", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderMenu();

	reportSheetProps().onBlock();
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();
	block.resolve();
	await flush();

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(blocking.revert).not.toHaveBeenCalled();
});

it("closes on Back instead of letting Back leave the profile", async () => {
	const { trigger } = renderMenu();
	expect(backHandledInApp(), "a closed menu leaves Back alone").toBe(false);

	await openMenu();
	expect(backHandledInApp(), "the open menu takes Back").toBe(true);
	await flush();

	expect(trigger.getAttribute("aria-expanded")).toBe("false");
	await vi.waitFor(() =>
		expect(
			screen.queryAllByRole("menuitem", { hidden: true }),
		).toHaveLength(0),
	);
	expect(backHandledInApp(), "the next Back leaves the profile").toBe(false);
});

describe("ProfileActionsMenu wording", () => {
	it("names the trigger Profile menu", () => {
		const { trigger } = renderMenu();

		expect(screen.getByRole("button", { name: "Profile menu" })).toBe(
			trigger,
		);
	});

	it("lists every action", async () => {
		renderMenu();

		const shown = await openMenu();

		expect(shown.map((item) => item.textContent.trim())).toEqual(ITEMS);
	});

	it("copies the profile ID and says so", async () => {
		renderMenu();

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
			renderMenu();

			const failure = await fail({ item, request });

			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label,
				error: failure,
			});
		},
	);

	it("words the trigger and the items in the active locale", async () => {
		const { trigger } = renderMenu();

		await setLocale({ locale: "en-XA" });
		const shown = await openMenu();

		expect(trigger.getAttribute("aria-label")).toMatch(PSEUDO_MESSAGE);
		expect(shown).toHaveLength(ITEMS.length);
		for (const item of shown) {
			expect(item.textContent.trim()).toMatch(PSEUDO_MESSAGE);
		}
	});

	it("words the copy toast in the active locale", async () => {
		renderMenu();

		await setLocale({ locale: "en-XA" });
		await copyId();

		expect(toastSuccessMock.mock.lastCall?.[0]).toMatch(PSEUDO_MESSAGE);
	});

	it.each(failures)(
		"words the $item failure in the active locale",
		async ({ item, request }) => {
			renderMenu();

			await setLocale({ locale: "en-XA" });
			await fail({ item, request });

			expect(showErrorToastMock.mock.lastCall?.[0].label).toMatch(
				PSEUDO_MESSAGE,
			);
		},
	);
});
