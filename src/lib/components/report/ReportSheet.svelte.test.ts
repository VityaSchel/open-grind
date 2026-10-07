// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	reportProfileMock,
	blockUserMock,
	showErrorToastMock,
	openExternalLinkMock,
} = vi.hoisted(() => ({
	reportProfileMock: vi.fn<() => Promise<void>>(),
	blockUserMock: vi.fn<() => Promise<void>>(),
	showErrorToastMock: vi.fn(),
	openExternalLinkMock: vi.fn(),
}));

vi.mock("$lib/api/safety/reports", () => ({
	reportProfile: reportProfileMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: showErrorToastMock }));
vi.mock("$lib/platform/link-opener", () => ({
	openExternalLink: openExternalLinkMock,
}));

import ReportSheet from "./ReportSheet.svelte";

const PROFILE_ID = 100010;

async function submitSpamReport({
	blockable,
	onBlock,
}: { blockable?: boolean; onBlock?: () => Promise<void> } = {}) {
	render(ReportSheet, {
		props: { open: true, profileId: PROFILE_ID, blockable, onBlock },
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
	it("offers to block the reported profile and blocks it", async () => {
		const block = await submitSpamReport();

		expect(
			screen.getByText(
				"You can block this profile so you stop seeing it.",
			),
		).not.toBeNull();
		await fireEvent.click(block);

		expect(blockUserMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
		});
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(
			screen.queryByRole("link", {
				name: "Why can't I block this profile?",
			}),
		).toBeNull();
	});

	it("keeps Block disabled for a non-blockable profile and links to the blocking guide", async () => {
		const onBlock = vi.fn(() => Promise.resolve());
		const block = await submitSpamReport({ blockable: false, onBlock });

		expect(block.disabled).toBe(true);
		expect(
			screen.queryByText(
				"You can block this profile so you stop seeing it.",
			),
		).toBeNull();
		await fireEvent.click(
			screen.getByRole("link", {
				name: "Why can't I block this profile?",
			}),
		);

		expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
			"https://opengrind.org/guides/blocking-and-hiding-profiles",
		);
		expect(onBlock).not.toHaveBeenCalled();
		expect(blockUserMock).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).not.toBeNull();
	});

	it("lets its owner carry out the block", async () => {
		const onBlock = vi.fn(() => Promise.resolve());
		const block = await submitSpamReport({ onBlock });

		await fireEvent.click(block);

		expect(onBlock).toHaveBeenCalledOnce();
		expect(blockUserMock).not.toHaveBeenCalled();
		await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("stays open and reports a block that fails", async () => {
		const rejection = new Error("offline");
		const block = await submitSpamReport({
			onBlock: () => Promise.reject(rejection),
		});

		await fireEvent.click(block);

		await vi.waitFor(() =>
			expect(showErrorToastMock).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to block user",
				error: rejection,
			}),
		);
		expect(
			screen.getByRole<HTMLButtonElement>("button", {
				name: "Block profile",
			}).disabled,
		).toBe(false);
	});
});
