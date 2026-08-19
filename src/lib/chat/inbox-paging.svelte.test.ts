import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "$lib/api/api-error";
import { InboxPaging } from "./inbox-paging.svelte";

const request = { method: "POST", path: "/v4/inbox" };

const retryable = () =>
	new ApiError({ message: "server down", request, kind: "Http" });

const permanent = () =>
	new ApiError({
		message: "bad request",
		request,
		kind: "Api",
		response: { status: 400, body: "" },
	});

function pagingWith(loadPage: (page: number) => Promise<void>) {
	let cursor: number | null = 2;
	const paging = new InboxPaging({ loadPage, cursor: () => cursor });
	return { paging, setCursor: (next: number | null) => (cursor = next) };
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("InboxPaging", () => {
	it("loads the current cursor and stays quiet when there is none", async () => {
		const loadPage = vi.fn(() => Promise.resolve());
		const { paging, setCursor } = pagingWith(loadPage);

		await paging.run();
		expect(loadPage).toHaveBeenCalledExactlyOnceWith(2);

		setCursor(null);
		await paging.run();

		expect(loadPage).toHaveBeenCalledTimes(1);
	});

	it("holds the arm token steady on failure so the sentinel cannot spin", async () => {
		const { paging } = pagingWith(() => Promise.reject(retryable()));
		const before = paging.armToken;

		await paging.run();

		expect(paging.failure).toBeInstanceOf(ApiError);
		expect(paging.running).toBe(false);
		expect(paging.armToken).toBe(before);
	});

	it("re-arms on a widening backoff ladder, then gives up", async () => {
		const { paging } = pagingWith(() => Promise.reject(retryable()));
		const tokens: string[] = [];

		for (const delay of [2_000, 6_000, 18_000]) {
			const before = paging.armToken;
			await paging.run();
			await vi.advanceTimersByTimeAsync(delay - 1);
			expect(paging.armToken).toBe(before);
			await vi.advanceTimersByTimeAsync(1);
			expect(paging.armToken).not.toBe(before);
			expect(paging.failure).toBeNull();
			tokens.push(paging.armToken);
		}

		const exhausted = paging.armToken;
		await paging.run();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(paging.armToken).toBe(exhausted);
		expect(new Set(tokens).size).toBe(3);
	});

	it("ignores demands while a failure is on display", async () => {
		const loadPage = vi.fn(() => Promise.reject(retryable()));
		const { paging } = pagingWith(loadPage);
		await paging.run();
		expect(loadPage).toHaveBeenCalledTimes(1);

		await paging.run();
		await paging.run();

		expect(loadPage).toHaveBeenCalledTimes(1);
		expect(paging.failure).toBeInstanceOf(ApiError);
	});

	it("schedules nothing when destroyed while a load is in flight", async () => {
		let reject!: (error: unknown) => void;
		const { paging } = pagingWith(
			() =>
				new Promise<void>((_, fail) => {
					reject = fail;
				}),
		);
		const inFlight = paging.run();
		const before = paging.armToken;

		paging.destroy();
		reject(retryable());
		await inFlight;
		await vi.advanceTimersByTimeAsync(60_000);

		expect(paging.armToken).toBe(before);
	});

	it("never schedules a retry for a permanent failure", async () => {
		const { paging } = pagingWith(() => Promise.reject(permanent()));

		await paging.run();
		const after = paging.armToken;
		await vi.advanceTimersByTimeAsync(60_000);

		expect(paging.armToken).toBe(after);
	});

	it("retries at once on request, cancelling the pending backoff", async () => {
		const loadPage = vi
			.fn<(page: number) => Promise<void>>()
			.mockRejectedValueOnce(retryable())
			.mockResolvedValue(undefined);
		const { paging } = pagingWith(loadPage);
		await paging.run();
		const afterFailure = paging.armToken;

		paging.retry();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(loadPage).toHaveBeenCalledTimes(2);
		expect(paging.failure).toBeNull();
		expect(paging.armToken).toBe(afterFailure);
	});

	it("restarts the ladder when a requested retry fails again", async () => {
		const { paging } = pagingWith(() => Promise.reject(retryable()));
		await paging.run();
		await vi.advanceTimersByTimeAsync(60_000);
		const exhausted = paging.armToken;

		paging.retry();
		await vi.advanceTimersByTimeAsync(2_000);

		expect(paging.armToken).not.toBe(exhausted);
	});

	it("clears a failure and re-arms when the list is refreshed", async () => {
		const { paging } = pagingWith(() => Promise.reject(retryable()));
		await paging.run();
		const failed = paging.armToken;

		paging.rearm();

		expect(paging.failure).toBeNull();
		expect(paging.armToken).not.toBe(failed);
	});

	it("replays a demand that arrived mid-flight, once the load succeeds", async () => {
		let release!: () => void;
		const loadPage = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const { paging } = pagingWith(loadPage);
		const before = paging.armToken;

		const first = paging.run();
		await paging.run();
		expect(loadPage).toHaveBeenCalledTimes(1);

		release();
		await first;

		expect(paging.armToken).not.toBe(before);
	});

	it("drops a mid-flight demand when the load fails, leaving retry in charge", async () => {
		let reject!: (error: unknown) => void;
		const loadPage = vi.fn(
			() =>
				new Promise<void>((_, fail) => {
					reject = fail;
				}),
		);
		const { paging } = pagingWith(loadPage);

		const first = paging.run();
		await paging.run();
		const before = paging.armToken;
		reject(retryable());
		await first;

		expect(paging.armToken).toBe(before);
	});

	it("cancels a pending retry when destroyed", async () => {
		const { paging } = pagingWith(() => Promise.reject(retryable()));
		await paging.run();
		const failed = paging.armToken;

		paging.destroy();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(paging.armToken).toBe(failed);
	});
});
