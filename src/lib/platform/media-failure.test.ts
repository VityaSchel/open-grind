import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, tauri } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	tauri: { enabled: true },
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tauri-apps/api/core")>()),
	invoke: invokeMock,
	isTauri: () => tauri.enabled,
}));

import {
	describeMediaError,
	describeMediaFailure,
	type MediaFailure,
	mediaFailure,
	remedyFor,
} from "$lib/platform/media-failure";

const SRC = "http://ogmedia.localhost/iPAYLOAD";

beforeEach(() => {
	invokeMock.mockReset();
	tauri.enabled = true;
});

describe("mediaFailure", () => {
	it("asks the media proxy what went wrong with a source", async () => {
		const failure = {
			kind: "status",
			status: 403,
			phase: null,
			host: "d3.cloudfront.net",
			signatureExpired: true,
		};
		invokeMock.mockResolvedValue(failure);

		await expect(mediaFailure(SRC)).resolves.toEqual(failure);
		expect(invokeMock).toHaveBeenCalledWith("media_failure", { src: SRC });
	});

	it("has nothing to say outside the app", async () => {
		tauri.enabled = false;

		await expect(mediaFailure(SRC)).resolves.toBeNull();
		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("treats an answer it cannot read as no answer", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		invokeMock.mockResolvedValue({ kind: "somethingNew" });

		await expect(mediaFailure(SRC)).resolves.toBeNull();
	});
});

describe("describeMediaFailure", () => {
	it("names the status or kind, the host and an expired signature", () => {
		expect(
			describeMediaFailure({
				kind: "status",
				status: 403,
				phase: null,
				host: "d3.cloudfront.net",
				signatureExpired: true,
			}),
		).toBe("status 403 from d3.cloudfront.net, signature expired");
		expect(
			describeMediaFailure({
				kind: "transport",
				status: null,
				phase: null,
				host: "cdns.grindr.com",
				signatureExpired: false,
			}),
		).toBe("transport from cdns.grindr.com");
		expect(
			describeMediaFailure({
				kind: "timeout",
				status: null,
				phase: "headers",
				host: "d3.cloudfront.net",
				signatureExpired: false,
			}),
		).toBe("timeout (headers) from d3.cloudfront.net");
		expect(describeMediaFailure(null)).toBe("no details");
	});
});

describe("describeMediaError", () => {
	it("names the error code, the time it took and the browser's message", () => {
		expect(
			describeMediaError({
				error: {
					code: 4,
					message: "DEMUXER_ERROR_NO_SUPPORTED_STREAMS",
				},
				elapsedSeconds: 2.04,
			}),
		).toBe("MediaError 4 after 2.0s: DEMUXER_ERROR_NO_SUPPORTED_STREAMS");
		expect(
			describeMediaError({
				error: { code: 2, message: "" },
				elapsedSeconds: 0.42,
			}),
		).toBe("MediaError 2 after 0.4s");
		expect(describeMediaError({ error: null, elapsedSeconds: 12 })).toBe(
			"unknown media error after 12.0s",
		);
	});
});

describe("remedyFor", () => {
	const of = (overrides: Partial<MediaFailure>): MediaFailure => ({
		kind: "status",
		status: null,
		phase: null,
		host: "d3.cloudfront.net",
		signatureExpired: false,
		...overrides,
	});

	it("retries what a second attempt can fix", () => {
		for (const failure of [
			of({ kind: "connect" }),
			of({ kind: "transport" }),
			of({ kind: "notReady" }),
			of({ status: 500 }),
			of({ kind: "transport", signatureExpired: true }),
		]) {
			expect(remedyFor(failure), JSON.stringify(failure)).toBe("retry");
		}
	});

	it("renews a refused or expired signature", () => {
		expect(remedyFor(of({ status: 403 }))).toBe("renew");
		expect(remedyFor(of({ status: 404, signatureExpired: true }))).toBe(
			"renew",
		);
	});

	it("retries a timeout unless the whole transfer already ran out of time", () => {
		expect(remedyFor(of({ kind: "timeout", phase: "headers" }))).toBe(
			"retry",
		);
		expect(remedyFor(of({ kind: "timeout", phase: "receiving" }))).toBe(
			"retry",
		);
		expect(remedyFor(of({ kind: "timeout", phase: null }))).toBe("retry");
		expect(remedyFor(of({ kind: "timeout", phase: "unfinished" }))).toBe(
			"none",
		);
	});

	it("gives up on everything else", () => {
		for (const failure of [
			of({ status: 404 }),
			of({ status: 499 }),
			of({ kind: "tooLarge" }),
			of({ kind: "refused" }),
			null,
		]) {
			expect(remedyFor(failure), JSON.stringify(failure)).toBe("none");
		}
	});
});
