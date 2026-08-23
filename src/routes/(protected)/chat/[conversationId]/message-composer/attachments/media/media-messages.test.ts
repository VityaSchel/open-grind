import { describe, expect, it } from "vitest";

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

	it("leaves the hash empty when the url carries none", () => {
		const draft = mediaMessageDraft({
			item: { ...item, url: "https://cdns.grindr.com/images/chat/x" },
			expiring: false,
		});

		expect(draft.optimistic.body).toMatchObject({ imageHash: "" });
	});
});
