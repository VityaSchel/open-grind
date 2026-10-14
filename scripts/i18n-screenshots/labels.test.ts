import { describe, expect, it } from "vitest";

import { compositeButtons, englishMeasured } from "./labels";
import { type Captured, emptyCapture } from "./manifest";

const CARD = ["profile.age", "profile.distance", "profile.name"];

function captured(viewIds: string[]): Captured {
	const capture = emptyCapture();
	for (const viewId of viewIds) {
		capture.views[viewId] = {
			image: `images/${viewId}.webp`,
			sha256: "plain",
			pixelHash: "plain",
			platform: "phone",
			keys: [],
			ms: 1,
		};
	}
	return capture;
}

describe("englishMeasured", () => {
	it("lists the kept views measured in English, numbered ones included", () => {
		const capture = captured(["settings/app", "settings/app#2", "chat"]);
		capture.measured.push("settings/app#2", "settings/app", "dropped");
		expect(englishMeasured(capture)).toEqual([
			"settings/app",
			"settings/app#2",
		]);
	});
});

describe("compositeButtons", () => {
	it("lists the composite buttons of the kept views in view order", () => {
		const capture = captured(["profile", "chat"]);
		capture.compositeButtons.profile = [CARD];
		capture.compositeButtons.chat = [CARD, [...CARD, "chat.unread"]];
		capture.compositeButtons.dropped = [CARD];
		expect(compositeButtons(capture)).toEqual([
			{ view: "chat", keys: CARD },
			{ view: "chat", keys: [...CARD, "chat.unread"] },
			{ view: "profile", keys: CARD },
		]);
	});
});
