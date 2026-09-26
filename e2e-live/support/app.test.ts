import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "@playwright/test";

import { rateLimitsSeen, watchRateLimits } from "./app";

const rustEncodedResponses = {
	rateLimited: "gqZzdGF0dXPNAa2kYm9kecQMeyJjb2RlIjo0Mjl9",
	ok: "gqZzdGF0dXPMyKRib2R5xAd7ImEiOjF9",
};

type WatchedWindow = Window & {
	__TAURI_INTERNALS__?: { invoke: (...call: unknown[]) => Promise<unknown> };
	__ogLiveRateLimits?: number;
};

const watchedWindow = window as WatchedWindow;

const pageInThisWindow = {
	evaluate: <Arg, Result>(run: (arg: Arg) => Result, arg: Arg) =>
		Promise.resolve(run(arg)),
} as unknown as Page;

async function watchAppAnswering(answer: () => Promise<unknown>) {
	const invoke = vi.fn(answer);
	watchedWindow.__TAURI_INTERNALS__ = { invoke };
	await watchRateLimits(pageInThisWindow);
	return {
		invoke,
		call: (...call: unknown[]) =>
			watchedWindow.__TAURI_INTERNALS__?.invoke(...call),
	};
}

afterEach(() => {
	delete watchedWindow.__TAURI_INTERNALS__;
	delete watchedWindow.__ogLiveRateLimits;
});

describe("watchRateLimits", () => {
	it("counts a 429 that the request command answers with", async () => {
		const app = await watchAppAnswering(() =>
			Promise.resolve(rustEncodedResponses.rateLimited),
		);
		await app.call("request", { payload: "" });
		expect(await rateLimitsSeen(pageInThisWindow)).toBe(1);
	});

	it("counts a 429 inside an upload outcome", async () => {
		const app = await watchAppAnswering(() =>
			Promise.resolve({
				response: rustEncodedResponses.rateLimited,
				sha256: null,
				bodySize: 0,
			}),
		);
		await app.call("upload_media_file", {});
		expect(await rateLimitsSeen(pageInThisWindow)).toBe(1);
	});

	it("counts a rate-limited command error", async () => {
		const app = await watchAppAnswering(() =>
			Promise.reject(
				Object.assign(new Error("Rate limited"), {
					kind: "RateLimited",
				}),
			),
		);
		await expect(app.call("current_session")).rejects.toMatchObject({
			kind: "RateLimited",
		});
		expect(await rateLimitsSeen(pageInThisWindow)).toBe(1);
	});

	it("ignores successful responses", async () => {
		const app = await watchAppAnswering(() =>
			Promise.resolve(rustEncodedResponses.ok),
		);
		await expect(app.call("request", { payload: "" })).resolves.toBe(
			rustEncodedResponses.ok,
		);
		expect(await rateLimitsSeen(pageInThisWindow)).toBe(0);
	});

	it("passes every invoke argument through to the app", async () => {
		const app = await watchAppAnswering(() => Promise.resolve(null));
		const options = { headers: { path: "a" } };
		await app.call("plugin:fs|write_file", new Uint8Array([1]), options);
		expect(app.invoke).toHaveBeenCalledWith(
			"plugin:fs|write_file",
			new Uint8Array([1]),
			options,
		);
	});
});
