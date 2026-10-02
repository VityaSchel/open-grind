// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, expect, it, vi } from "vitest";

const { reportSheetMock } = vi.hoisted(() => ({ reportSheetMock: vi.fn() }));

vi.mock("$lib/components/report/ReportSheet.svelte", () => ({
	default: reportSheetMock,
}));

import ProfileActionsMenu from "./ProfileActionsMenu.svelte";

afterEach(cleanup);

it("settles a block the report sheet has already sent instead of leaving it in flight", () => {
	const blocking = { revert: vi.fn(), settle: vi.fn() };
	const markBlocked = vi.fn(() => blocking);
	render(ProfileActionsMenu, {
		props: {
			profileId: 100001,
			blockable: true,
			submitting: false,
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
