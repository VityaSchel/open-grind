import { describe, expect, it } from "vitest";

import {
	messageSchema,
	outboundMessageSchema,
} from "$lib/model/messaging/messages";
import type { DrawerMedia } from "$lib/api/messaging/drawer";
import { mediaMessageDraft } from "./media-messages";

const HASH = "a".repeat(64);

const item: DrawerMedia = {
	id: 800_001,
	url: `https://cdns.grindr.com/images/chat/${HASH}`,
	contentType: "image/jpeg",
	createdTs: 1_700_000_000_000,
	used: false,
	takenOnGrindr: true,
};

describe("mediaMessageDraft", () => {
	it("sends a plain image by reference and previews it with its hash", () => {
		const draft = mediaMessageDraft({ item, expiring: false });

		expect(draft.outbound).toEqual({
			type: "Image",
			body: { mediaId: item.id },
		});
		expect(draft.optimistic).toEqual({
			type: "Image",
			body: {
				mediaId: item.id,
				width: null,
				height: null,
				url: item.url,
				imageHash: HASH,
				takenOnGrindr: true,
				createdAt: item.createdTs,
			},
		});
	});

	it("sends an expiring image flagged as such", () => {
		const draft = mediaMessageDraft({ item, expiring: true });

		expect(draft.outbound).toEqual({
			type: "ExpiringImage",
			body: { mediaId: item.id, expiring: true },
		});
		expect(draft.optimistic).toEqual({
			type: "ExpiringImage",
			body: {
				mediaId: item.id,
				width: null,
				height: null,
				url: item.url,
			},
		});
	});

	const video: DrawerMedia = {
		...item,
		id: 800_002,
		url: "https://cdns.grindr.com/videos/chat/clip.mp4",
		contentType: "video/mp4",
	};

	it("sends a video that can be replayed", () => {
		const draft = mediaMessageDraft({ item: video, expiring: false });

		expect(draft.outbound).toEqual({
			type: "Video",
			body: { mediaId: video.id, looping: false, maxViews: 2 },
		});
		expect(draft.optimistic).toEqual({
			type: "Video",
			body: {
				mediaId: video.id,
				url: video.url,
				contentType: "video/mp4",
				length: 0,
				maxViews: 2,
				looping: false,
			},
		});
	});

	it("sends an expiring video as view once", () => {
		const draft = mediaMessageDraft({ item: video, expiring: true });

		expect(draft.outbound).toEqual({
			type: "Video",
			body: { mediaId: video.id, looping: false, maxViews: 1 },
		});
		expect(draft.optimistic).toMatchObject({
			type: "Video",
			body: { mediaId: video.id, url: video.url, maxViews: 1 },
		});
	});

	it("builds drafts that the message schemas accept", () => {
		for (const expiring of [false, true]) {
			for (const media of [item, video]) {
				const draft = mediaMessageDraft({ item: media, expiring });
				expect(() =>
					outboundMessageSchema.parse(draft.outbound),
				).not.toThrow();
				expect(() =>
					messageSchema.parse(draft.optimistic),
				).not.toThrow();
			}
		}
	});

	it("leaves the hash empty when the url carries none", () => {
		const draft = mediaMessageDraft({
			item: { ...item, url: "https://cdns.grindr.com/images/chat/x" },
			expiring: false,
		});

		expect(draft.optimistic.body).toMatchObject({ imageHash: "" });
	});
});
