// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
	reportProfileMock,
	reportRightNowPostMock,
	blockUserMock,
	showBlockFailureMock,
	openExternalLinkMock,
} = vi.hoisted(() => ({
	reportProfileMock: vi.fn<() => Promise<void>>(),
	reportRightNowPostMock: vi.fn<() => Promise<void>>(),
	blockUserMock: vi.fn<() => Promise<void>>(),
	showBlockFailureMock: vi.fn(),
	openExternalLinkMock: vi.fn(),
}));

vi.mock("#lib/api/safety/reports.ts", () => ({
	reportProfile: reportProfileMock,
	reportRightNowPost: reportRightNowPostMock,
}));
vi.mock("#lib/api/browse/blocks.ts", () => ({ blockUser: blockUserMock }));
vi.mock("#lib/api/error-toast.ts", () => ({ showErrorToast: vi.fn() }));
vi.mock("./block-failure", () => ({ showBlockFailure: showBlockFailureMock }));
vi.mock("#lib/platform/link-opener.ts", () => ({
	openExternalLink: openExternalLinkMock,
}));

import type { ReportTarget } from "./report-request";
import ReportSheet from "./ReportSheet.svelte";

const PROFILE_ID = 100010;
const POST_ID = 880_009;
const profileTarget: ReportTarget = { kind: "profile", profileId: PROFILE_ID };

async function submitSpamReport({ onBlock }: { onBlock?: () => void } = {}) {
	render(ReportSheet, {
		props: { open: true, target: profileTarget, onBlock },
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
	reportRightNowPostMock.mockResolvedValue(undefined);
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
		render(ReportSheet, { props: { open: true, target: profileTarget } });
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

describe("reported targets", () => {
	async function chooseHarassment(target: ReportTarget) {
		render(ReportSheet, { props: { open: true, target } });
		await fireEvent.click(
			await screen.findByRole("radio", {
				name: "Harassment or Bullying",
			}),
		);
	}

	const whereGroup = () =>
		screen.queryByRole("group", { name: "Where it happened" });

	it("asks a profile report where it happened", async () => {
		await chooseHarassment(profileTarget);

		expect(
			screen.getByRole("heading", { name: "Report profile" }),
		).toBeTruthy();
		expect(whereGroup()).not.toBeNull();
	});

	it("files a message report from the chat without asking where", async () => {
		await chooseHarassment({ kind: "message", profileId: PROFILE_ID });
		expect(whereGroup()).toBeNull();

		await fireEvent.click(
			screen.getByRole("button", { name: "Submit report" }),
		);

		expect(reportProfileMock).toHaveBeenCalledExactlyOnceWith({
			profileId: PROFILE_ID,
			report: {
				reason: "HARASSMENT_BULLYING",
				comment: "",
				locations: ["CHAT_MESSAGE"],
			},
		});
	});

	it("files a known author's Right Now post report about the post, then offers to block them", async () => {
		await chooseHarassment({
			kind: "rightNowPost",
			postId: POST_ID,
			profileId: PROFILE_ID,
		});
		expect(
			screen.getByRole("heading", { name: "Report post" }),
		).toBeTruthy();
		expect(whereGroup()).toBeNull();

		await fireEvent.click(
			screen.getByRole("button", { name: "Submit report" }),
		);

		expect(reportRightNowPostMock).toHaveBeenCalledExactlyOnceWith({
			postId: POST_ID,
			profileId: PROFILE_ID,
			report: {
				reason: "HARASSMENT_BULLYING",
				comment: "",
				locations: ["RIGHT_NOW_PHOTO", "RIGHT_NOW_TEXT"],
			},
		});
		expect(reportProfileMock).not.toHaveBeenCalled();
		expect(
			await screen.findByText("Grindr will review this post."),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: "Block profile" }),
		).toBeTruthy();
	});

	it("offers only Done after reporting an anonymous Right Now post", async () => {
		await chooseHarassment({
			kind: "rightNowPost",
			postId: POST_ID,
			profileId: null,
		});

		await fireEvent.click(
			screen.getByRole("button", { name: "Submit report" }),
		);

		expect(reportRightNowPostMock).toHaveBeenCalledWith(
			expect.objectContaining({ postId: POST_ID, profileId: null }),
		);
		await screen.findByText("Grindr will review this post.");
		expect(
			screen.queryByRole("button", { name: "Block profile" }),
		).toBeNull();
		expect(
			screen.queryByText(
				"You can block this profile so you stop seeing it.",
			),
		).toBeNull();
		expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
	});
});
