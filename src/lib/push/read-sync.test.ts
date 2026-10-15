import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requestInboxResync, shownPushConversations, focus } = vi.hoisted(
	() => ({
		requestInboxResync: vi.fn(),
		shownPushConversations: vi.fn<() => Promise<string[]>>(),
		focus: { focused: true },
	}),
);

vi.mock("$lib/chat/inbox-resync", () => ({ requestInboxResync }));
vi.mock("./index", () => ({ shownPushConversations }));
vi.mock("$lib/platform/window-focus", () => ({
	windowFocused: () => focus.focused,
}));

const AWAY_RECHECK_MS = 2 * 60 * 1000;
const MIN_RESYNC_GAP_MS = 30 * 1000;

async function freshModule() {
	vi.resetModules();
	return import("./read-sync");
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("resyncing reads made elsewhere on desktop", () => {
	it("resyncs the inbox while a chat notification is showing", async () => {
		const { resyncWhileShown } = await freshModule();
		shownPushConversations.mockResolvedValue(["1:2"]);

		await resyncWhileShown();

		expect(requestInboxResync).toHaveBeenCalledOnce();
	});

	it("leaves the inbox alone when no chat notification is showing", async () => {
		const { resyncWhileShown } = await freshModule();
		shownPushConversations.mockResolvedValue([]);

		await resyncWhileShown();

		expect(requestInboxResync).not.toHaveBeenCalled();
	});

	it("resyncs at most once per gap, however often the window refocuses", async () => {
		const { resyncWhileShown } = await freshModule();
		shownPushConversations.mockResolvedValue(["1:2"]);

		await resyncWhileShown();
		await resyncWhileShown();
		expect(requestInboxResync).toHaveBeenCalledOnce();

		vi.advanceTimersByTime(MIN_RESYNC_GAP_MS);
		await resyncWhileShown();
		expect(requestInboxResync).toHaveBeenCalledTimes(2);
	});

	it("rechecks periodically only while the window is away", async () => {
		const { recheckReadsWhileAway } = await freshModule();
		shownPushConversations.mockResolvedValue(["1:2"]);
		focus.focused = true;
		const stop = recheckReadsWhileAway();

		await vi.advanceTimersByTimeAsync(AWAY_RECHECK_MS);
		expect(requestInboxResync).not.toHaveBeenCalled();

		focus.focused = false;
		await vi.advanceTimersByTimeAsync(AWAY_RECHECK_MS);
		expect(requestInboxResync).toHaveBeenCalledOnce();

		stop();
		await vi.advanceTimersByTimeAsync(AWAY_RECHECK_MS);
		expect(requestInboxResync).toHaveBeenCalledOnce();
	});
});
