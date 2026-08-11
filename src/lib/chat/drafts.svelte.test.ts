import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Drafts } from "./drafts.svelte";

const AUTOSAVE_INTERVAL_MS = 1_000;
const A = "a:1";
const B = "b:2";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("Drafts", () => {
	it("reports no draft for a conversation that was never typed into", () => {
		expect(new Drafts().get(A)).toBe("");
	});

	it("holds an autosaved draft back until the interval elapses", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "hi" });

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS - 1);
		expect(drafts.get(A)).toBe("");

		vi.advanceTimersByTime(1);
		expect(drafts.get(A)).toBe("hi");
	});

	it("autosaves the latest text once for a burst of typing", () => {
		const drafts = new Drafts();
		for (const text of ["h", "he", "hey"]) {
			drafts.autosave({ conversationId: A, text });
			vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS / 2);
		}

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("hey");
	});

	it("saves immediately without waiting for the interval", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "hi" });

		expect(drafts.get(A)).toBe("hi");
	});

	it("keeps drafts of different conversations apart", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "for a" });
		drafts.save({ conversationId: B, text: "for b" });

		expect(drafts.get(A)).toBe("for a");
		expect(drafts.get(B)).toBe("for b");
	});

	it("drops a draft that was emptied", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "hi" });
		drafts.save({ conversationId: A, text: "" });

		expect(drafts.get(A)).toBe("");
	});

	it("drops a draft of only whitespace", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: " \n\t " });

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("");
	});

	it("keeps a saved draft from being overwritten by an earlier autosave", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "stale" });
		drafts.save({ conversationId: A, text: "sent" });

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("sent");
	});

	it("does not resurrect a draft that was emptied while an autosave was pending", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "hi" });
		drafts.save({ conversationId: A, text: "" });

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("");
	});

	it("leaves a pending autosave alone when another conversation is saved", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "for a" });
		drafts.save({ conversationId: B, text: "for b" });

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("for a");
		expect(drafts.get(B)).toBe("for b");
	});

	it("commits a pending autosave when typing moves to another conversation", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "for a" });
		drafts.autosave({ conversationId: B, text: "for b" });

		expect(drafts.get(A)).toBe("for a");
		expect(drafts.get(B)).toBe("");

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(B)).toBe("for b");
	});

	it("discards a draft along with its pending autosave", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "hi" });
		drafts.autosave({ conversationId: A, text: "hi again" });
		drafts.discard(A);

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("");
	});

	it("discards one conversation without touching another", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "for a" });
		drafts.save({ conversationId: B, text: "for b" });
		drafts.discard(A);

		expect(drafts.get(B)).toBe("for b");
	});

	it("forgets every draft on destroy", () => {
		const drafts = new Drafts();
		drafts.save({ conversationId: A, text: "for a" });
		drafts.save({ conversationId: B, text: "for b" });
		drafts.destroy();

		expect(drafts.get(A)).toBe("");
		expect(drafts.get(B)).toBe("");
	});

	it("cancels a pending autosave on destroy", () => {
		const drafts = new Drafts();
		drafts.autosave({ conversationId: A, text: "hi" });
		drafts.destroy();

		vi.advanceTimersByTime(AUTOSAVE_INTERVAL_MS);
		expect(drafts.get(A)).toBe("");
		expect(vi.getTimerCount()).toBe(0);
	});
});
