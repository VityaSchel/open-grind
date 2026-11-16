import { describe, expect, it } from "vitest";

import { type Captured, DOCUMENT_TITLE, emptyCapture } from "./manifest";
import { coverageReport } from "./report";

const NOTIFICATION = "Body of the desktop system notification.";
const TAPS = "Count of taps in the Taps tab.";

const CATALOGS = {
	chat: {
		title: "Inbox",
		unread_one: "{{count}} unread chat",
		unread_other: "{{count}} unread chats",
		notification: {
			message: "Sent you a message",
			photos_one: "Sent you {{count}} photo",
			photos_other: "Sent you {{count}} photos",
		},
	},
	interest: {
		taps: { count_one: "{{count}} tap", count_other: "{{count}} taps" },
	},
};

const UNCAPTURABLE = {
	"chat.notification.*": {
		reason: "Desktop only.",
		explanation: NOTIFICATION,
	},
	"interest.taps.count": { reason: "Never rendered.", explanation: TAPS },
	"gone.*": { reason: "Removed.", explanation: "Gone from the app." },
};

function captured(): Captured {
	const capture = emptyCapture();
	capture.views.chat = {
		image: "images/chat.webp",
		sha256: "plain",
		pixelHash: "plain",
		platform: "phone",
		keys: [{ key: "chat.title", via: DOCUMENT_TITLE, top: false }],
		ms: 1,
	};
	capture.unmarked.chat = ["Online now", "3 new", "Grindr", "Demo Name"];
	capture.unmarked.empty = ["x"];
	capture.measured.push("chat");
	return capture;
}

describe("coverageReport", () => {
	it("writes each covered key's explanation under its full key", () => {
		expect(
			coverageReport({
				commit: "abc123",
				catalogs: CATALOGS,
				uncapturable: UNCAPTURABLE,
				fixtures: "const name = 'Demo Name';",
				sceneData: [],
				captured: captured(),
			}),
		).toEqual({
			commit: "abc123",
			keys: 5,
			shown: 1,
			uncapturable: 3,
			missing: ["chat.unread"],
			unmarked: { chat: ["Online now"] },
			staleUncapturable: ["gone.*"],
			explanations: {
				"chat.notification.message": NOTIFICATION,
				"chat.notification.photos": NOTIFICATION,
				"interest.taps.count": TAPS,
			},
			englishMeasured: ["chat"],
			compositeButtons: [],
		});
	});

	it("explains no covered key that a view shows", () => {
		const capture = captured();
		capture.views["chat/notification"] = {
			image: "images/chat/notification.webp",
			sha256: "plain",
			pixelHash: "plain",
			platform: "phone",
			keys: [
				{
					key: "chat.notification.message",
					box: { x: 0, y: 0, width: 10, height: 10 },
					via: "text",
					top: false,
				},
			],
			ms: 1,
		};
		const { shown, explanations } = coverageReport({
			commit: "abc123",
			catalogs: CATALOGS,
			uncapturable: UNCAPTURABLE,
			fixtures: "",
			sceneData: [],
			captured: capture,
		});
		expect(shown).toBe(2);
		expect(explanations).toEqual({
			"chat.notification.photos": NOTIFICATION,
			"interest.taps.count": TAPS,
		});
	});

	it("orders explanations by key whatever order the catalogs come in", () => {
		const { explanations } = coverageReport({
			commit: "abc123",
			catalogs: { interest: CATALOGS.interest, chat: CATALOGS.chat },
			uncapturable: UNCAPTURABLE,
			fixtures: "",
			sceneData: [],
			captured: emptyCapture(),
		});
		expect(Object.keys(explanations)).toEqual([
			"chat.notification.message",
			"chat.notification.photos",
			"interest.taps.count",
		]);
	});

	it("reports no text that a scene hands the app as server data", () => {
		const capture = emptyCapture();
		capture.unmarked.tags = ["Kitesurfing", "Show more tags"];
		const { unmarked } = coverageReport({
			commit: "abc123",
			catalogs: CATALOGS,
			uncapturable: UNCAPTURABLE,
			fixtures: "",
			sceneData: [
				{
					demo: {
						restFaults: [
							{
								path: "/v1/tags",
								status: 200,
								body: [
									{
										tags: [
											{ tagId: 1, text: "Kitesurfing" },
										],
									},
								],
							},
						],
					},
				},
			],
			captured: capture,
		});
		expect(unmarked).toEqual({ tags: ["Show more tags"] });
	});
});
