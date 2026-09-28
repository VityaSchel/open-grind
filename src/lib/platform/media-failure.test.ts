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
	describeMediaFailure,
	mediaFailure,
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
				host: "d3.cloudfront.net",
				signatureExpired: true,
			}),
		).toBe("status 403 from d3.cloudfront.net, signature expired");
		expect(
			describeMediaFailure({
				kind: "transport",
				status: null,
				host: "cdns.grindr.com",
				signatureExpired: false,
			}),
		).toBe("transport from cdns.grindr.com");
		expect(describeMediaFailure(null)).toBe("no details");
	});
});
