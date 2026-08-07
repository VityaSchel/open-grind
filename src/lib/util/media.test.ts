import { afterEach, describe, expect, it } from "vitest";

import { fromBase64 } from "$lib/util/base64";
import { profileMediaUrl, proxyMediaUrl } from "$lib/util/media";

const PHOTO = "https://cdns.grindr.com/images/thumb/320x320/deadbeef";
const SIGNED =
	"https://d3lyqctnm3b6pb.cloudfront.net/a.jpg?Expires=1&Signature=x+y/z&Key-Pair-Id=K1";

const tauri = globalThis as {
	isTauri?: boolean;
	__TAURI_INTERNALS__?: {
		convertFileSrc: (filePath: string, protocol?: string) => string;
	};
};

function runningOn(osName: string) {
	tauri.isTauri = true;
	tauri.__TAURI_INTERNALS__ = {
		convertFileSrc: (filePath, protocol = "asset") => {
			const path = encodeURIComponent(filePath);
			return osName === "windows" || osName === "android"
				? `http://${protocol}.localhost/${path}`
				: `${protocol}://localhost/${path}`;
		},
	};
}

function proxiedTarget(url: string): string {
	const encoded = url.slice(url.lastIndexOf("/") + 2);
	const standard = encoded.replaceAll("-", "+").replaceAll("_", "/");
	return new TextDecoder().decode(fromBase64(standard));
}

afterEach(() => {
	delete tauri.isTauri;
	delete tauri.__TAURI_INTERNALS__;
});

describe("proxyMediaUrl", () => {
	it("leaves urls alone outside Tauri, where no handler exists", () => {
		expect(proxyMediaUrl(PHOTO)).toBe(PHOTO);
		expect(proxyMediaUrl(SIGNED)).toBe(SIGNED);
	});

	it("carries the whole url to the scheme handler", () => {
		runningOn("macos");

		const proxied = proxyMediaUrl(SIGNED);

		expect(proxied.startsWith("ogmedia://localhost/")).toBe(true);
		expect(proxiedTarget(proxied)).toBe(SIGNED);
	});

	it("uses the http form the platforms that need it expect", () => {
		runningOn("android");

		const proxied = proxyMediaUrl(PHOTO);

		expect(proxied.startsWith("http://ogmedia.localhost/")).toBe(true);
		expect(proxiedTarget(proxied)).toBe(PHOTO);
	});

	it("never percent-encodes, so the android scheme rewrite cannot bite", () => {
		runningOn("android");

		expect(proxyMediaUrl(SIGNED)).not.toContain("%");
	});

	it("tags which stack the Rust handler should imitate", () => {
		runningOn("macos");

		expect(proxyMediaUrl(PHOTO)).toContain("/i");
		expect(proxyMediaUrl(PHOTO, { as: "image" })).toBe(
			proxyMediaUrl(PHOTO),
		);
		expect(proxyMediaUrl(PHOTO, { as: "video" })).toContain("/v");
		expect(proxiedTarget(proxyMediaUrl(PHOTO, { as: "video" }))).toBe(
			PHOTO,
		);
	});

	it("passes through anything that is not a remote url", () => {
		runningOn("macos");

		for (const url of ["blob:nothing", "", "http://cdns.grindr.com/x"]) {
			expect(proxyMediaUrl(url)).toBe(url);
		}
		expect(proxyMediaUrl(null)).toBeNull();
		expect(proxyMediaUrl(undefined)).toBeNull();
	});
});

describe("profileMediaUrl", () => {
	it("builds the CDN url for each size and proxies it", () => {
		runningOn("macos");

		expect(
			proxiedTarget(
				profileMediaUrl({ mediaHash: "deadbeef", size: "thumb" }),
			),
		).toBe("https://cdns.grindr.com/images/thumb/320x320/deadbeef");
		expect(
			proxiedTarget(
				profileMediaUrl({ mediaHash: "deadbeef", size: "full" }),
			),
		).toBe("https://cdns.grindr.com/images/profile/1024x1024/deadbeef");
	});
});
