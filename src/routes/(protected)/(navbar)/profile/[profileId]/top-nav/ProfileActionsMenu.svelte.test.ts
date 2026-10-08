// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { reportSheetMock, blockUserMock, showBlockFailureMock } = vi.hoisted(
	() => ({
		reportSheetMock: vi.fn(),
		blockUserMock: vi.fn<() => Promise<void>>(),
		showBlockFailureMock: vi.fn(),
	}),
);

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/browse/hides", () => ({ hideUser: vi.fn() }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/components/report/block-failure", () => ({
	showBlockFailure: showBlockFailureMock,
}));

import { applyBackGestureHandler } from "$lib/platform/android-native-bridge";
import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

const PROFILE_ID = 100010;

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
			markHidden: vi.fn(),
		},
	});
	return { blocking, markBlocked };
}

function reportSheetProps() {
	const [, props] = reportSheetMock.mock.lastCall as [
		unknown,
		{ onBlock: () => void },
	];
	return props;
}

async function openMenu() {
	await fireEvent.keyDown(
		screen.getByRole("button", { name: "Profile menu" }),
		{ key: "Enter" },
	);
	return await screen.findAllByRole("menuitem", { hidden: true });
}

async function blockItem() {
	const item = (await openMenu()).find(
		(candidate) => candidate.textContent.trim() === "Block profile",
	);
	if (!item) throw new Error('the profile menu has no "Block profile" item');
	return item;
}

beforeEach(() => {
	vi.clearAllMocks();
	blockUserMock.mockResolvedValue(undefined);
	applyBackGestureHandler();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

it("shows the profile as blocked at once and settles once the block is confirmed", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderMenu();

	const item = await blockItem();
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
	vi.spyOn(console, "error").mockImplementation(() => {});
	const { blocking } = renderMenu();

	await fireEvent.click(await blockItem());
	await flush();

	expect(blocking.revert).toHaveBeenCalledOnce();
	expect(blocking.settle).not.toHaveBeenCalled();
	expect(showBlockFailureMock).toHaveBeenCalledExactlyOnceWith(rejection);
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
	renderMenu();
	const trigger = screen.getByRole("button", { name: "Profile menu" });
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
