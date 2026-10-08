// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reportProfileMock, blockUserMock, showBlockFailureMock } = vi.hoisted(
	() => ({
		reportProfileMock: vi.fn<() => Promise<void>>(),
		blockUserMock: vi.fn<() => Promise<void>>(),
		showBlockFailureMock: vi.fn(),
	}),
);

vi.mock("$lib/api/safety/reports", () => ({
	reportProfile: reportProfileMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("./block-failure", () => ({ showBlockFailure: showBlockFailureMock }));

import ReportSheet from "./ReportSheet.svelte";

const PROFILE_ID = 100010;

async function submitSpamReport({ onBlock }: { onBlock?: () => void } = {}) {
	render(ReportSheet, {
		props: { open: true, profileId: PROFILE_ID, onBlock },
	});
	await fireEvent.click(await screen.findByRole("radio", { name: "Spam" }));
	await fireEvent.click(
		screen.getByRole("button", { name: "Submit report" }),
	);
	return await screen.findByRole<HTMLButtonElement>("button", {
		name: "Block profile",
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	reportProfileMock.mockResolvedValue(undefined);
	blockUserMock.mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("report sheet", () => {
	it("closes at once and blocks the reported profile in the background", async () => {
		const block = Promise.withResolvers<void>();
		blockUserMock.mockReturnValueOnce(block.promise);
		const button = await submitSpamReport();
		expect(
			screen.getByText(
				"You can block this profile so you stop seeing it.",
			),
		).not.toBeNull();

		await fireEvent.click(button);

		expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		block.resolve();
		await Promise.resolve();
		expect(showBlockFailureMock).not.toHaveBeenCalled();
	});

	it("reports a background block that fails after it closed", async () => {
		const rejection = new Error("not listed");
		const block = Promise.withResolvers<void>();
		blockUserMock.mockReturnValueOnce(block.promise);

		await fireEvent.click(await submitSpamReport());
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		block.reject(rejection);

		await vi.waitFor(() =>
			expect(showBlockFailureMock).toHaveBeenCalledExactlyOnceWith(
				rejection,
			),
		);
	});

	it("closes at once and leaves the block to its owner", async () => {
		const onBlock = vi.fn();

		await fireEvent.click(await submitSpamReport({ onBlock }));

		expect(onBlock).toHaveBeenCalledOnce();
		expect(blockUserMock).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});
});
