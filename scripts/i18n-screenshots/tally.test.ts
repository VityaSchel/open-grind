import { describe, expect, it } from "vitest";

import type { View, ViewKey } from "./manifest";
import { tallyKeys } from "./tally";

const TITLE = "auth.signIn.title";
const SUBMIT = "auth.signIn.submit";
const KEYS = [TITLE, SUBMIT, "chat.notification.title"];
const PATTERNS = ["chat.notification.*", "gone.key"];

function view(keys: ViewKey[]): View {
	return {
		image: "images/auth/sign-in.webp",
		sha256: "plain",
		pixelHash: "plain",
		platform: "phone",
		keys,
		ms: 1,
	};
}

describe("tallyKeys", () => {
	it("counts a key that only a document title holds as shown", () => {
		expect(
			tallyKeys({
				keys: KEYS,
				patterns: PATTERNS,
				views: [
					view([{ key: TITLE, via: "document-title", top: false }]),
				],
			}),
		).toEqual({
			shown: 1,
			uncapturable: 1,
			missing: [SUBMIT],
			staleUncapturable: ["gone.key"],
		});
	});

	it("reports a key no view holds as missing", () => {
		expect(
			tallyKeys({ keys: KEYS, patterns: PATTERNS, views: [view([])] }),
		).toEqual({
			shown: 0,
			uncapturable: 1,
			missing: [TITLE, SUBMIT],
			staleUncapturable: ["gone.key"],
		});
	});
});
