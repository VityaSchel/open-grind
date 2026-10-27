import { cleanup } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getProfile: vi.fn(),
	carousel: vi.fn(),
	sendMessage: vi.fn(),
	showErrorToast: vi.fn(),
	success: vi.fn(),
	invalidateConversation: vi.fn(),
	ensureLoaded: vi.fn(),
	getConversations: vi.fn(),
	goto: vi.fn(),
	traverseBackTo: vi.fn(() => false),
}));

vi.mock("svelte-sonner", () => ({ toast: { success: mocks.success } }));

vi.mock("$app/navigation", () => ({ goto: mocks.goto }));
vi.mock("$lib/util/history", () => ({ traverseBackTo: mocks.traverseBackTo }));
vi.mock("$lib/api/users/profiles", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/users/profiles")>()),
	getProfile: mocks.getProfile,
}));
vi.mock("$lib/api/users/favorites", () => ({
	getFavoriteNote: vi.fn(),
	invalidateFavoriteNote: vi.fn(),
}));
vi.mock("$lib/api/messaging/messages", async (importOriginal) => ({
	...(await importOriginal<typeof import("$lib/api/messaging/messages")>()),
	sendMessage: mocks.sendMessage,
}));
vi.mock("$lib/api/error-toast", () => ({
	showErrorToast: mocks.showErrorToast,
}));
vi.mock("$lib/chat/conversations-context.svelte", () => ({
	getOrCreateConversationsState: mocks.getConversations,
}));
vi.mock("$lib/components/feedback/DataRefreshControl.svelte", () => ({
	default: vi.fn(),
}));
vi.mock("../ImageCarousel.svelte", () => ({ default: mocks.carousel }));

import { clearAccountCaches } from "$lib/api/account-caches";
import { conversationIdFor } from "$lib/chat/conversation-id";
import { Drafts } from "$lib/chat/drafts.svelte";
import type { ProfileState } from "../profile-state.svelte";
import { fullProfile, OUR_ID } from "./profile-pager-test-helpers";
import { gridRow, PROFILE_ID, renderPane } from "./profile-pane-test-helpers";

const reply = { imageHash: "selected-photo", text: "Original reply" };
const conversationId = conversationIdFor({
	profileId: PROFILE_ID,
	ourProfileId: OUR_ID,
});
let drafts: Drafts;
let source: ProfileState;

async function openPane() {
	source = renderPane({ active: true, row: gridRow() }).profileState;
	await vi.waitFor(() =>
		expect(mocks.carousel.mock.calls.at(-1)?.[1].onreply).toBeTypeOf(
			"function",
		),
	);
	return mocks.carousel.mock.calls.at(-1)![1].onreply as (reply: {
		imageHash: string;
		text: string;
	}) => Promise<void>;
}

beforeEach(() => {
	vi.resetAllMocks();
	drafts = new Drafts();
	mocks.getProfile.mockResolvedValue(fullProfile({ profileId: PROFILE_ID }));
	mocks.getConversations.mockReturnValue({
		drafts,
		invalidateConversation: mocks.invalidateConversation,
		ensureLoaded: mocks.ensureLoaded,
	});
	mocks.goto.mockResolvedValue(undefined);
	mocks.traverseBackTo.mockReturnValue(false);
});

afterEach(cleanup);

describe("profile photo reply delivery", () => {
	it("sends without navigating and preserves the chat draft", async () => {
		drafts.save({ conversationId, text: "Unfinished chat message" });
		drafts.setReplyTo({ conversationId, messageId: "existing-target" });
		const onreply = await openPane();
		await onreply(reply);
		await vi.waitFor(() =>
			expect(mocks.success).toHaveBeenCalledExactlyOnceWith(
				"Message sent",
			),
		);
		expect(mocks.sendMessage).toHaveBeenCalledExactlyOnceWith({
			toUserId: PROFILE_ID,
			message: {
				type: "ProfilePhotoReply",
				body: {
					imageHash: reply.imageHash,
					photoContentReply: reply.text,
				},
			},
		});
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(mocks.traverseBackTo).not.toHaveBeenCalled();
		expect(mocks.invalidateConversation).toHaveBeenCalledWith(
			conversationId,
		);
		expect(mocks.ensureLoaded).toHaveBeenCalledWith(conversationId);
		expect(drafts.get(conversationId)).toBe("Unfinished chat message");
		expect(drafts.replyTo(conversationId)).toBe("existing-target");
	});

	it("offers a retry with the original reply if sending fails", async () => {
		const error = new Error("send failed");
		mocks.sendMessage.mockRejectedValueOnce(error);
		const onreply = await openPane();
		await onreply(reply);
		await vi.waitFor(() =>
			expect(mocks.showErrorToast).toHaveBeenCalledWith({
				label: "Failed to send message",
				error,
				onRetry: expect.any(Function),
			}),
		);
		expect(mocks.success).not.toHaveBeenCalled();
		mocks.showErrorToast.mock.calls[0]![0].onRetry();
		await vi.waitFor(() =>
			expect(mocks.success).toHaveBeenCalledWith("Message sent"),
		);
		expect(mocks.sendMessage.mock.calls[1]).toEqual(
			mocks.sendMessage.mock.calls[0],
		);
	});

	it("shows success and refreshes the conversation after leaving the profile", async () => {
		const response = Promise.withResolvers<void>();
		mocks.sendMessage.mockReturnValueOnce(response.promise);
		await openPane();
		const delivery = source.replyToPhoto(reply);
		source.destroy();
		response.resolve();
		await delivery;
		expect(mocks.success).toHaveBeenCalledExactlyOnceWith("Message sent");
		expect(mocks.invalidateConversation).toHaveBeenCalledWith(
			conversationId,
		);
		expect(mocks.ensureLoaded).toHaveBeenCalledWith(conversationId);
	});

	it.each(["during send", "after error toast"])(
		"keeps the failed reply available for Retry when leaving %s",
		async (when) => {
			const error = new Error("send failed");
			const response = Promise.withResolvers<void>();
			mocks.sendMessage.mockReturnValueOnce(response.promise);
			await openPane();
			const delivery = source.replyToPhoto(reply);
			if (when === "during send") source.destroy();
			response.reject(error);
			await delivery;
			expect(mocks.showErrorToast).toHaveBeenCalledExactlyOnceWith({
				label: "Failed to send message",
				error,
				onRetry: expect.any(Function),
			});
			if (when === "after error toast") source.destroy();
			mocks.showErrorToast.mock.calls[0]![0].onRetry();
			await vi.waitFor(() =>
				expect(mocks.success).toHaveBeenCalledWith("Message sent"),
			);
			expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
			expect(mocks.sendMessage.mock.calls[1]).toEqual(
				mocks.sendMessage.mock.calls[0],
			);
		},
	);

	it.each(["account change", "disposal"])(
		"ignores stale replies after %s",
		async (change) => {
			const onreply = await openPane();
			if (change === "account change") clearAccountCaches();
			else source.destroy();
			await onreply(reply);
			expect(mocks.sendMessage).not.toHaveBeenCalled();
			expect(mocks.goto).not.toHaveBeenCalled();
			expect(mocks.getConversations).not.toHaveBeenCalled();
		},
	);

	it("does not retry a failed reply after the account changes", async () => {
		mocks.sendMessage.mockRejectedValueOnce(new Error("send failed"));
		await openPane();
		await source.replyToPhoto(reply);
		clearAccountCaches();
		mocks.showErrorToast.mock.calls[0]![0].onRetry();
		expect(mocks.sendMessage).toHaveBeenCalledOnce();
		expect(mocks.success).not.toHaveBeenCalled();
	});

	it("ignores a send success after the account changes", async () => {
		const response = Promise.withResolvers<void>();
		mocks.sendMessage.mockReturnValueOnce(response.promise);
		await openPane();
		const delivery = source.replyToPhoto(reply);
		clearAccountCaches();
		response.resolve();
		await delivery;
		expect(mocks.success).not.toHaveBeenCalled();
		expect(mocks.getConversations).not.toHaveBeenCalled();
	});

	it("ignores a send error after the account changes", async () => {
		const response = Promise.withResolvers<void>();
		mocks.sendMessage.mockReturnValueOnce(response.promise);
		const onreply = await openPane();
		void onreply(reply);
		clearAccountCaches();
		response.reject(new Error("send failed"));
		await new Promise((resolve) => setTimeout(resolve));
		expect(mocks.showErrorToast).not.toHaveBeenCalled();
	});
});
