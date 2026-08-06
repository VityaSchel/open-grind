import { describe, expect, it } from "vitest";

import {
	capText,
	documentTitle,
	maskGeohash,
	redactPath,
	redactStack,
	scrubText,
} from "$lib/api/redact/text";

describe("maskGeohash", () => {
	it("keeps the first two characters and masks the rest", () => {
		expect(maskGeohash("u4pruydqqvj8")).toBe("u4**********");
	});

	it("does not lengthen values shorter than the kept prefix", () => {
		expect(maskGeohash("u")).toBe("u");
		expect(maskGeohash("")).toBe("");
	});
});

describe("redactPath", () => {
	it("masks the grid geohash and keeps only the shape of each filter", () => {
		expect(
			redactPath(
				"/v4/cascade?nearbyGeoHash=u4pruydqqvj8&rightNow=true&sexualPositions=2,4" +
					"&genders=1,2&tribes=9,11&sexualHealth=4&ageMin=25&ageMax=40&pageNumber=2",
			),
		).toBe(
			"/v4/cascade?nearbyGeoHash=u4**********&rightNow={boolean}" +
				"&sexualPositions={list:2}&genders={list:2}&tribes={list:2}" +
				"&sexualHealth={number}&ageMin={number}&ageMax={number}&pageNumber=2",
		);
	});

	it("masks exploreGeoHash too", () => {
		expect(redactPath("/v4/cascade?exploreGeoHash=gcpvj0duy2yj")).toBe(
			"/v4/cascade?exploreGeoHash=gc**********",
		);
	});

	it("drops the searched place name but reports its length", () => {
		expect(
			redactPath("/v3/places/search?placeName=221B%20Baker%20Street"),
		).toBe("/v3/places/search?placeName={string:17}");
	});

	it("masks id-shaped path segments and keeps route literals", () => {
		expect(redactPath("/v7/profiles/123456789")).toBe("/v7/profiles/{id}");
		expect(redactPath("/v3/me/favorites/123456789")).toBe(
			"/v3/me/favorites/{id}",
		);
		expect(redactPath("/v2/albums/9876")).toBe("/v2/albums/{id}");
		expect(redactPath("/v4/chat/media/drawer/aBcD1234hash")).toBe(
			"/v4/chat/media/drawer/{id}",
		);
	});

	it("masks conversation ids, which embed both participants' profile ids", () => {
		expect(
			redactPath("/v5/chat/conversation/1234:5678/message?profile=true"),
		).toBe("/v5/chat/conversation/{id}/message?profile={boolean}");
		expect(
			redactPath(
				"/v4/chat/conversation/1234:5678/message/1699999999999:abc-def",
			),
		).toBe("/v4/chat/conversation/{id}/message/{id}");
	});

	it("leaves paths that carry no user data untouched", () => {
		for (const path of [
			"/v3.1/me/profile",
			"/v4/chat/message/send",
			"/public/v2/genders",
			"/v1/pronouns",
			"/v2/taps/received",
			"/v7/views/list",
			"/v3.1/me/blocks",
		]) {
			expect(redactPath(path)).toBe(path);
		}
	});
});

describe("scrubText", () => {
	it("redacts the request URL a transport error embeds", () => {
		expect(
			scrubText(
				"error sending request for url (https://grindr.mobi/v4/cascade?nearbyGeoHash=u4pruydqqvj8&rightNow=true)",
			),
		).toBe(
			"error sending request for url (https://grindr.mobi/v4/cascade?nearbyGeoHash=u4**********&rightNow={boolean})",
		);
	});

	it("does not leak a local path through a non-http url", () => {
		expect(scrubText("failed to load file:///Users/someone/app.js")).toBe(
			"failed to load <url>",
		);
	});

	it("masks an address a server echoed back", () => {
		expect(scrubText("User alex.b+grindr@example.co.uk not found")).toBe(
			"User <email> not found",
		);
	});

	it("leaves a Safari-style stack frame alone", () => {
		expect(
			scrubText("load@http://tauri.localhost/assets/index-a1b2.js:1:2"),
		).toBe("load@http://tauri.localhost/assets/{id}");
	});

	it("masks home directories", () => {
		expect(
			scrubText(
				"    at send (/Users/someone/dev/open-grind/src/app.ts:12:3)",
			),
		).toBe("    at send (/Users/<user>/dev/open-grind/src/app.ts:12:3)");
		expect(scrubText("at send (C:\\Users\\someone\\app.ts:12:3)")).toBe(
			"at send (C:\\Users\\<user>\\app.ts:12:3)",
		);
	});

	it("leaves messages without identifiers alone", () => {
		expect(scrubText("API request failed with status 500")).toBe(
			"API request failed with status 500",
		);
	});
});

describe("redactStack", () => {
	const albumUrl =
		"https://cdns.grindr.com/videos/9f3a1c0b2e7d4a5b6c8d9e0f1a2b3c4d5e6f7081.mp4";

	it("redacts the message V8 repeats in the stack header", () => {
		const message = `Failed to load video: ${albumUrl}`;
		const stack = `Error: ${message}\n    at load (http://tauri.localhost/assets/index-a1b2.js:1:2345)`;

		const redacted = redactStack({ stack, message });
		expect(redacted).not.toContain(albumUrl);
		expect(redacted).toBe(
			"Error: Failed to load video: https://cdns.grindr.com/videos/{id}\n" +
				"    at load (http://tauri.localhost/assets/index-a1b2.js:1:2345)",
		);
	});

	it("keeps frames intact when the engine emits no header", () => {
		const stack =
			"load@http://tauri.localhost/assets/index-a1b2.js:1:2345\n" +
			"run@/Users/someone/dev/open-grind/src/lib/api/error.ts:24:5";
		expect(redactStack({ stack, message: "boom" })).toBe(
			"load@http://tauri.localhost/assets/index-a1b2.js:1:2345\n" +
				"run@/Users/<user>/dev/open-grind/src/lib/api/error.ts:24:5",
		);
	});

	it("handles an error with no message", () => {
		const stack = "Error\n    at run (/Users/someone/app.ts:1:1)";
		expect(redactStack({ stack, message: "" })).toBe(
			"Error\n    at run (/Users/<user>/app.ts:1:1)",
		);
	});
});

describe("documentTitle", () => {
	it("reads the title of a block page", () => {
		expect(
			documentTitle(
				"<!DOCTYPE html><html><head><title>Attention Required! | Cloudflare</title></head>",
			),
		).toBe("Attention Required! | Cloudflare");
	});

	it("returns nothing for a page without one", () => {
		expect(documentTitle("<html><body>nope</body></html>")).toBeUndefined();
		expect(documentTitle("<title>   </title>")).toBeUndefined();
	});
});

describe("capText", () => {
	it("reports how much it dropped", () => {
		expect(capText("abcdef", 3)).toBe("abc…<+3 chars>");
		expect(capText("abc", 3)).toBe("abc");
	});
});
