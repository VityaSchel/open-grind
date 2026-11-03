import { describe, expect, it } from "vitest";

import { demoRoute } from "$lib/demo";
import { apiResponseMessageSchema } from "$lib/model/messaging/messages";

function send(message: { type: string; body: unknown }) {
	return apiResponseMessageSchema.parse(
		demoRoute({
			path: "/v4/chat/message/send",
			method: "POST",
			body: { ...message, target: { type: "Direct", targetId: 100001 } },
		}).body,
	);
}

describe("demo sent messages", () => {
	it("echo a GIF body unchanged", () => {
		const gif = {
			type: "Giphy",
			body: {
				id: "xT0xeChUR33EsYNNRK",
				urlPath:
					"https://media.giphy.com/media/xT0xeChUR33EsYNNRK/200.gif",
				previewPath:
					"https://media.giphy.com/media/xT0xeChUR33EsYNNRK/200.gif",
				stillPath:
					"https://media.giphy.com/media/xT0xeChUR33EsYNNRK/200_s.gif",
				width: 356,
				height: 200,
				imageHash: "giphy/xT0xeChUR33EsYNNRK",
			},
		};

		expect(send(gif)).toMatchObject(gif);
	});

	it("echo a Gaymoji body unchanged", () => {
		const gaymoji = {
			type: "Gaymoji",
			body: { imageHash: "gaymoji/1_2_Yass.png" },
		};

		expect(send(gaymoji)).toMatchObject(gaymoji);
	});
});
