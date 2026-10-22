// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	reportProfileMock,
	blockUserMock,
	showBlockFailureMock,
	openExternalLinkMock,
} = vi.hoisted(() => ({
	reportProfileMock: vi.fn<() => Promise<void>>(),
	blockUserMock: vi.fn<() => Promise<void>>(),
	showBlockFailureMock: vi.fn(),
	openExternalLinkMock: vi.fn(),
}));

vi.mock("$lib/api/safety/reports", () => ({
	reportProfile: reportProfileMock,
}));
vi.mock("$lib/api/browse/blocks", () => ({ blockUser: blockUserMock }));
vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("./block-failure", () => ({ showBlockFailure: showBlockFailureMock }));
vi.mock("$lib/platform/link-opener", () => ({
	openExternalLink: openExternalLinkMock,
}));

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

describe("serious in-person incident", () => {
	async function chooseIncident() {
		vi.spyOn(navigator, "language", "get").mockReturnValue("de-AT");
		render(ReportSheet, { props: { open: true, profileId: PROFILE_ID } });
		await fireEvent.click(
			await screen.findByRole("radio", {
				name: "Serious In Person Incident",
			}),
		);
	}

	it("opens Grindr's help form in the system language instead of sending a report", async () => {
		await chooseIncident();

		await fireEvent.click(
			screen.getByRole("link", { name: "Open help form" }),
		);

		expect(openExternalLinkMock).toHaveBeenCalledExactlyOnceWith(
			"https://help.grindr.com/hc/de/requests/new?ticket_form_id=16925729533971",
		);
		expect(reportProfileMock).not.toHaveBeenCalled();
		expect(
			screen.queryByRole("button", { name: "Submit report" }),
		).toBeNull();
	});

	it("asks for neither where it happened nor details", async () => {
		await chooseIncident();

		expect(
			screen.queryByRole("group", { name: "Where it happened" }),
		).toBeNull();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(
			screen.getByText(/handles serious in-person incidents/),
		).not.toBeNull();
	});
});
