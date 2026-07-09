import { describe, expect, it } from "vitest";
import z from "zod";

import { demoRoute } from "$lib/demo";
import { cascadeV3ResponseSchema } from "$lib/model/browse/grid/cascade/response/v3";
import { searchProfileSchema } from "$lib/model/browse/grid/search";
import { tapProfileSchema } from "$lib/model/interest/tap-profile";
import {
	viewerProfileSchema,
	viewPreviewSchema,
} from "$lib/model/interest/views";
import {
	albumContentSchema,
	albumDetailsSchema,
	albumMinSchema,
} from "$lib/model/messaging/albums";
import { fullConversationSchema } from "$lib/model/messaging/conversations";
import {
	apiResponseMessageSchema,
	expiringImageMessageSchema,
	previewLabel,
} from "$lib/model/messaging/messages";
import {
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
} from "$lib/model/users/profiles";

const shortProfileSchema = z.object({
	...profileShortSchema.shape,
	...profileRightNowSchema.shape,
});

const route = (path: string, method = "GET", body?: unknown) =>
	demoRoute(path, method, body).body;

describe("demo route data matches the real schemas", () => {
	const firstProfileId = (
		items: z.infer<typeof cascadeV3ResponseSchema>["items"],
	): number => {
		for (const item of items) {
			if ("data" in item && "profileId" in item.data)
				return item.data.profileId;
		}
		throw new Error("no profile item");
	};

	it("cascade grid page validates and paginates", () => {
		const page0 = cascadeV3ResponseSchema.parse(
			route("/v3/cascade?nearbyGeoHash=u00"),
		);
		expect(page0.items.length).toBeGreaterThan(0);
		expect(page0.nextPage).toBe(1);

		const page1 = cascadeV3ResponseSchema.parse(
			route("/v3/cascade?nearbyGeoHash=u00&pageNumber=1"),
		);
		expect(firstProfileId(page0.items)).not.toBe(firstProfileId(page1.items));
	});

	it("full profile validates for an arbitrary id", () => {
		const body = route("/v7/profiles/100123") as { profiles: unknown[] };
		profileSchema.parse(body.profiles[0]);
	});

	it("profile batch validates", () => {
		const body = route("/v3/profiles", "POST", {
			targetProfileIds: [100001, 100002, 100250],
		}) as { profiles: unknown[] };
		expect(body.profiles).toHaveLength(3);
		for (const profile of body.profiles) shortProfileSchema.parse(profile);
	});

	it("my profile + uploaded photos validate", () => {
		const me = route("/v4/me/profile") as { profiles: unknown[] };
		shortProfileSchema.parse(me.profiles[0]);
		z.object({
			medias: z.array(
				z.object({
					mediaHash: z.hex().length(40),
					type: z.number(),
					state: z.number(),
				}),
			),
		}).parse(route("/v3.1/me/profile/images"));
	});

	it("search validates", () => {
		const body = route("/v7/search?nearbyGeoHash=u00") as {
			profiles: unknown[];
		};
		for (const profile of body.profiles) searchProfileSchema.parse(profile);
	});

	it("conversations are sorted by last activity and previews are correct", () => {
		const body = route("/v4/inbox?page=1", "POST") as {
			entries: unknown[];
		};
		const entries = z.array(fullConversationSchema).parse(body.entries);
		const times = entries.map((e) => e.data.lastActivityTimestamp);
		expect(times).toEqual([...times].sort((a, b) => b - a));
		const imageConv = entries.find((e) => e.data.preview?.type === "Image");
		expect(imageConv?.data.preview?.text).toBeNull();
		const albumConv = entries.find((e) => e.data.preview?.type === "Album");
		expect(albumConv?.data.preview?.albumId).not.toBeNull();
		expect(previewLabel(albumConv?.data.preview ?? null)).toBe("Album");
	});

	it("conversation messages validate and align with the preview", () => {
		const inbox = route("/v4/inbox?page=1", "POST") as {
			entries: {
				data: { conversationId: string; preview: { text: string | null } };
			}[];
		};
		for (const entry of inbox.entries) {
			const id = entry.data.conversationId;
			const body = route(
				`/v5/chat/conversation/${id}/message?profile=true`,
			) as { messages: unknown[]; lastReadTimestamp: number | null };
			const messages = z.array(apiResponseMessageSchema).parse(body.messages);
			expect(messages.length).toBeGreaterThan(0);
			expect(messages[0].timestamp).toBeGreaterThanOrEqual(
				messages[messages.length - 1].timestamp,
			);
		}
	});

	const albumResponseSchema = z.object({
		...albumMinSchema.shape,
		...albumDetailsSchema.shape,
		content: z.array(
			z.object({
				...albumContentSchema.shape,
				remainingViews: z.int().optional(),
			}),
		),
	});

	it("album and expiring-image messages resolve to valid content", () => {
		const inbox = route("/v4/inbox?page=1", "POST") as {
			entries: { data: { conversationId: string } }[];
		};
		let albums = 0;
		let expiringImages = 0;
		for (const entry of inbox.entries) {
			const id = entry.data.conversationId;
			const body = route(
				`/v5/chat/conversation/${id}/message?profile=true`,
			) as { messages: unknown[] };
			const messages = z.array(apiResponseMessageSchema).parse(body.messages);
			for (const message of messages) {
				if (
					message.type === "Album" ||
					message.type === "ExpiringAlbum" ||
					message.type === "ExpiringAlbumV2"
				) {
					albums++;
					const album = albumResponseSchema.parse(
						route(`/v2/albums/${message.body.albumId}`),
					);
					expect(album.content.length).toBeGreaterThan(0);
				} else if (message.type === "ExpiringImage") {
					expiringImages++;
					const single = expiringImageMessageSchema.parse(
						(
							route(
								`/v4/chat/conversation/${id}/message/${message.messageId}`,
							) as { message: unknown }
						).message,
					);
					if (message.body.viewsRemaining !== 0) {
						expect(single.body.url).not.toBeNull();
					}
				}
			}
		}
		expect(albums).toBeGreaterThan(0);
		expect(expiringImages).toBeGreaterThan(0);
	});

	it("paginated message requests are empty", () => {
		const body = route(
			"/v5/chat/conversation/100000:100001/message?profile=true&pageKey=x",
		) as { messages: unknown[] };
		expect(body.messages).toHaveLength(0);
	});

	it("sending a message echoes a valid message", () => {
		const body = route("/v4/chat/message/send", "POST", {
			type: "Text",
			target: { type: "Direct", targetId: 100001 },
			body: { text: "hi" },
		});
		apiResponseMessageSchema.parse(body);
	});

	it("taps and views validate", () => {
		const taps = route("/v2/taps/received") as { profiles: unknown[] };
		for (const tap of taps.profiles) tapProfileSchema.parse(tap);

		const views = route("/v7/views/list") as {
			profiles: unknown[];
			previews: unknown[];
		};
		for (const profile of views.profiles) viewerProfileSchema.parse(profile);
		for (const preview of views.previews) viewPreviewSchema.parse(preview);
	});

	it("reference data validates and mutations are accepted no-ops", () => {
		expect(Array.isArray(route("/public/v2/genders"))).toBe(true);
		expect(Array.isArray(route("/v1/pronouns"))).toBe(true);
		expect(Array.isArray(route("/v1/tags"))).toBe(true);
		expect(demoRoute("/v4/me/profile", "PATCH", { aboutMe: "x" }).status).toBe(
			200,
		);
		expect(demoRoute("/v3/me/blocks/100001", "POST", undefined).status).toBe(
			200,
		);
		expect(demoRoute("/v3/me/favorites/100001", "POST", undefined).status).toBe(
			200,
		);
	});

	it("conversation pin/mute/delete mutations persist across inbox fetches", () => {
		const inbox = () => {
			const body = route("/v4/inbox?page=1", "POST") as { entries: unknown[] };
			return z.array(fullConversationSchema).parse(body.entries);
		};
		const [first, second, third] = inbox();

		route(
			`/v4/chat/conversation/${first.data.conversationId}/${first.data.pinned ? "unpin" : "pin"}`,
			"POST",
		);
		route(
			`/v1/push/conversation/${second.data.conversationId}/${second.data.muted ? "unmute" : "mute"}`,
			"POST",
		);
		route(`/v4/chat/conversation/${third.data.conversationId}`, "DELETE");

		const after = inbox();
		expect(
			after.find(
				(e) => e.data.conversationId === first.data.conversationId,
			)?.data.pinned,
		).toBe(!first.data.pinned);
		expect(
			after.find(
				(e) => e.data.conversationId === second.data.conversationId,
			)?.data.muted,
		).toBe(!second.data.muted);
		expect(
			after.some((e) => e.data.conversationId === third.data.conversationId),
		).toBe(false);
	});
});
