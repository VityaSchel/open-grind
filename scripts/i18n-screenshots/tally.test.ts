import { describe, expect, it } from "vitest";

import type { View, ViewKey } from "./manifest";
import { explainKeys, shownKeys, tallyKeys, type Uncapturable } from "./tally";

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

function entry(explanation: string): Uncapturable[string] {
	return { reason: "Never rendered.", explanation };
}

describe("tallyKeys", () => {
	it("counts a key that only a document title holds as shown", () => {
		expect(
			tallyKeys({
				keys: KEYS,
				patterns: PATTERNS,
				shown: shownKeys([
					view([{ key: TITLE, via: "document-title", top: false }]),
				]),
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
			tallyKeys({
				keys: KEYS,
				patterns: PATTERNS,
				shown: shownKeys([view([])]),
			}),
		).toEqual({
			shown: 0,
			uncapturable: 1,
			missing: [TITLE, SUBMIT],
			staleUncapturable: ["gone.key"],
		});
	});
});

describe("explainKeys", () => {
	it("gives every key a wildcard covers that wildcard's explanation", () => {
		expect(
			explainKeys({
				keys: KEYS,
				uncapturable: { "auth.signIn.*": entry("Sign-in.") },
				shown: new Set(),
			}),
		).toEqual({ [TITLE]: "Sign-in.", [SUBMIT]: "Sign-in." });
	});

	it("prefers a key's own entry, then the longest wildcard", () => {
		expect(
			explainKeys({
				keys: [
					"chat.a",
					"chat.notification.body",
					"chat.notification.title",
				],
				uncapturable: {
					"chat.*": entry("Chat."),
					"chat.notification.title": entry("Title."),
					"chat.notification.*": entry("Notification."),
				},
				shown: new Set(),
			}),
		).toEqual({
			"chat.a": "Chat.",
			"chat.notification.body": "Notification.",
			"chat.notification.title": "Title.",
		});
	});

	it("leaves out keys no entry covers", () => {
		expect(
			explainKeys({
				keys: KEYS,
				uncapturable: { "gone.key": entry("Gone.") },
				shown: new Set(),
			}),
		).toEqual({});
	});

	it("leaves out covered keys that a view shows", () => {
		expect(
			explainKeys({
				keys: KEYS,
				uncapturable: { "auth.signIn.*": entry("Sign-in.") },
				shown: new Set([SUBMIT]),
			}),
		).toEqual({ [TITLE]: "Sign-in." });
	});
});
