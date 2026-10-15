import { beforeEach, describe, expect, it, vi } from "vitest";

const { markConversationAsRead } = vi.hoisted(() => ({
	markConversationAsRead: vi.fn<() => Promise<void>>(),
}));

vi.mock("$lib/api/error-toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("$lib/api/messaging/conversations", () => ({ markConversationAsRead }));

import { ConversationReadRequests } from "./conversation-read-requests";
import { conversation, deferred } from "./conversations-test-helpers";

const CHAT = "1:2";

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "error").mockImplementation(() => {});
	markConversationAsRead.mockResolvedValue(undefined);
});

describe("ConversationReadRequests", () => {
	it("sends one follow-up for any reads made while a read is in flight", async () => {
		const requests = new ConversationReadRequests();
		const entry = conversation(CHAT, 1000, { unreadCount: 1 });
		const first = deferred<void>();
		markConversationAsRead.mockReturnValueOnce(first.promise);

		const sent = requests.read(entry);
		for (let i = 0; i < 3; i++) {
			entry.data.unreadCount += 1;
			void requests.read(entry);
		}
		first.resolve();
		await sent;

		expect(markConversationAsRead).toHaveBeenCalledTimes(2);
		expect(entry.data.unreadCount).toBe(0);
	});

	it("gives back every count a failed read cleared", async () => {
		const requests = new ConversationReadRequests();
		const entry = conversation(CHAT, 1000, { unreadCount: 2 });
		const first = deferred<void>();
		markConversationAsRead.mockReturnValueOnce(first.promise);

		const sent = requests.read(entry);
		entry.data.unreadCount = 1;
		void requests.read(entry);
		first.reject(new Error("offline"));
		await sent;

		expect(entry.data.unreadCount).toBe(3);
	});

	it("does not give back a count that a newer snapshot already replaced", async () => {
		const requests = new ConversationReadRequests();
		const entry = conversation(CHAT, 1000, { unreadCount: 3 });
		const first = deferred<void>();
		markConversationAsRead.mockReturnValueOnce(first.promise);

		const sent = requests.read(entry);
		requests.noteSnapshot(CHAT);
		entry.data.unreadCount = 3;
		void requests.read(entry);
		first.reject(new Error("offline"));
		await sent;

		expect(entry.data.unreadCount).toBe(3);
	});

	it("sends a new read once the previous one has settled", async () => {
		const requests = new ConversationReadRequests();
		const entry = conversation(CHAT, 1000, { unreadCount: 1 });

		await requests.read(entry);
		entry.data.unreadCount = 1;
		await requests.read(entry);

		expect(markConversationAsRead).toHaveBeenCalledTimes(2);
	});

	it("still sends a new read after the previous one failed", async () => {
		const requests = new ConversationReadRequests();
		const entry = conversation(CHAT, 1000, { unreadCount: 1 });
		markConversationAsRead.mockRejectedValueOnce(new Error("offline"));

		await requests.read(entry);
		await requests.read(entry);

		expect(markConversationAsRead).toHaveBeenCalledTimes(2);
		expect(entry.data.unreadCount).toBe(0);
	});

	it("reads a conversation the inbox does not list only while it is known unread", async () => {
		const requests = new ConversationReadRequests();

		await requests.readUnlisted(CHAT);
		requests.noteUnlistedUnread(CHAT);
		await requests.readUnlisted(CHAT);
		await requests.readUnlisted(CHAT);

		expect(markConversationAsRead).toHaveBeenCalledExactlyOnceWith({
			conversationId: CHAT,
		});
	});

	it("keeps an unlisted conversation unread when its read fails", async () => {
		const requests = new ConversationReadRequests();
		markConversationAsRead.mockRejectedValueOnce(new Error("offline"));

		requests.noteUnlistedUnread(CHAT);
		await requests.readUnlisted(CHAT);
		await requests.readUnlisted(CHAT);

		expect(markConversationAsRead).toHaveBeenCalledTimes(2);
	});
});
