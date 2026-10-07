// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { reportSheetMock, blockUserMock, openExternalLinkMock } = vi.hoisted(
	() => ({
		reportSheetMock: vi.fn(),
		blockUserMock: vi.fn<() => Promise<void>>(),
		openExternalLinkMock: vi.fn(),
	}),
);

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/browse/hides", () => ({ hideUser: vi.fn() }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/platform/link-opener", () => ({
	openExternalLink: openExternalLinkMock,
}));

import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

const PROFILE_ID = 100010;
const GUIDE_NAME = "Why can't I block this profile?";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function renderMenu({ blockable }: { blockable: boolean }) {
	const blocking = { revert: vi.fn(), settle: vi.fn() };
	const markBlocked = vi.fn(() => blocking);
	render(ProfileActionsMenu, {
		props: {
			profileId: PROFILE_ID,
			blockable,
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
		{ blockable: boolean; onBlock: () => Promise<void> },
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
});

afterEach(cleanup);

it("blocks a blockable profile from the menu", async () => {
	const { blocking } = renderMenu({ blockable: true });

	await fireEvent.click(await blockItem());
	await flush();

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(screen.queryByLabelText(GUIDE_NAME)).toBeNull();
});

it("keeps Block disabled for a non-blockable profile and links to the blocking guide", async () => {
	const { markBlocked } = renderMenu({ blockable: false });

	const block = await blockItem();
	expect(block.getAttribute("aria-disabled")).toBe("true");
	await fireEvent.click(block);
	await fireEvent.keyDown(block, { key: "Enter" });
	await fireEvent.click(screen.getByLabelText(GUIDE_NAME));
	await flush();

	expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
		"https://opengrind.org/guides/blocking-and-hiding-profiles",
	);
	expect(markBlocked).not.toHaveBeenCalled();
	expect(blockUserMock).not.toHaveBeenCalled();
});

it("tells the report sheet whether the profile can be blocked", () => {
	renderMenu({ blockable: false });

	expect(reportSheetProps().blockable).toBe(false);
});

it("settles a block the report sheet sends once it lands", async () => {
	const block = Promise.withResolvers<void>();
	blockUserMock.mockReturnValueOnce(block.promise);
	const { blocking, markBlocked } = renderMenu({ blockable: true });

	const blocked = reportSheetProps().onBlock();
	expect(markBlocked).not.toHaveBeenCalled();
	block.resolve();
	await blocked;

	expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
		profileId: PROFILE_ID,
	});
	expect(markBlocked).toHaveBeenCalledOnce();
	expect(blocking.settle).toHaveBeenCalledOnce();
	expect(blocking.revert).not.toHaveBeenCalled();
});
