import { describe, expect, it } from "vitest";
import z from "zod";

import { demoRoute } from "$lib/demo";
import { demoMeProfileId } from "$lib/demo/config";
import { cascadeV4ResponseSchema } from "$lib/model/browse/grid/cascade/response/v4";
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
	albumSharesResponseSchema,
	myAlbumsResponseSchema,
} from "$lib/model/messaging/albums";
import { fullConversationSchema } from "$lib/model/messaging/conversations";
import { previewLabel } from "$lib/model/messaging/message-preview";
import {
	apiResponseMessageSchema,
	expiringImageMessageSchema,
} from "$lib/model/messaging/messages";
import { gendersSchema } from "$lib/model/users/genders";
import {
	profileRightNowSchema,
	profileSchema,
	profileShortSchema,
} from "$lib/model/users/profiles";
import { pronounsSchema } from "$lib/model/users/pronouns";
import { profileTagsResponseSchema } from "$lib/model/users/tags";

const shortProfileSchema = z.object({
	...profileShortSchema.shape,
	...profileRightNowSchema.shape,
});

const route = (path: string, method = "GET", body?: unknown) =>
	demoRoute({ path, method, body }).body;

describe("demo route data matches the real schemas", () => {
	const firstProfileId = (
		items: z.infer<typeof cascadeV4ResponseSchema>["items"],
	): number => {
		for (const item of items) {
			if ("data" in item && "profileId" in item.data)
				return item.data.profileId;
		}
		throw new Error("no profile item");
	};

	it("cascade grid page validates and paginates", () => {
		const page0 = cascadeV4ResponseSchema.parse(
			route("/v4/cascade?nearbyGeoHash=u00"),
		);
		expect(page0.items.length).toBeGreaterThan(0);
		expect(page0.nextPage).toBe(1);

		const page1 = cascadeV4ResponseSchema.parse(
			route("/v4/cascade?nearbyGeoHash=u00&pageNumber=1"),
		);
		expect(firstProfileId(page0.items)).not.toBe(
			firstProfileId(page1.items),
		);
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

	it("own profile + uploaded photos validate", () => {
		const me = route(`/v7/profiles/${demoMeProfileId}`) as {
			profiles: unknown[];
		};
		profileSchema.parse(me.profiles[0]);
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
				data: {
					conversationId: string;
					preview: { text: string | null };
				};
			}[];
		};
		for (const entry of inbox.entries) {
			const id = entry.data.conversationId;
			const body = route(
				`/v5/chat/conversation/${id}/message?profile=true`,
			) as { messages: unknown[]; lastReadTimestamp: number | null };
			const messages = z
				.array(apiResponseMessageSchema)
				.parse(body.messages);
			const [newest] = messages;
			const oldest = messages.at(-1);
			if (!newest || !oldest) throw new Error(`no messages in ${id}`);
			expect(newest.timestamp).toBeGreaterThanOrEqual(oldest.timestamp);
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
			const messages = z
				.array(apiResponseMessageSchema)
				.parse(body.messages);
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

	it("my albums cover the states the composer tab renders", () => {
		const { albums } = myAlbumsResponseSchema.parse(route("/v1/albums"));

		expect(albums.length).toBeGreaterThan(0);
		expect(albums.some((album) => album.albumName === null)).toBe(true);
		expect(albums.some((album) => !album.isShareable)).toBe(true);
		expect(
			albums.some((album) =>
				album.content.some((item) =>
					item.contentType.startsWith("video/"),
				),
			),
		).toBe(true);
	});

	it("records an album share against the album it names", () => {
		const albumId = myAlbumsResponseSchema.parse(route("/v1/albums"))
			.albums[0]!.albumId;
		const sharedCountOf = (id: number) =>
			myAlbumsResponseSchema
				.parse(route("/v1/albums"))
				.albums.find((album) => album.albumId === id)!.sharedCount;
		const before = sharedCountOf(albumId);
		const neighborBefore = sharedCountOf(albumId + 1);

		expect(
			demoRoute({
				path: `/v4/albums/${albumId}/shares`,
				method: "POST",
				body: {
					profiles: [{ profileId: 1, expirationType: "INDEFINITE" }],
				},
			}).status,
		).toBe(200);

		expect(sharedCountOf(albumId)).toBe(before + 1);
		expect(sharedCountOf(albumId + 1)).toBe(neighborBefore);
	});

	it("lists the profiles an album is shared with, then forgets an unshare", () => {
		const albumId = 902;
		const sharesOf = (id: number) =>
			albumSharesResponseSchema.parse(route(`/v1/albums/${id}/shares`))
				.profileIds;

		expect(sharesOf(albumId)).not.toContain(7);

		route(`/v4/albums/${albumId}/shares`, "POST", {
			profiles: [{ profileId: 7, expirationType: "INDEFINITE" }],
		});
		expect(sharesOf(albumId)).toContain(7);

		expect(
			demoRoute({
				path: `/v1/albums/${albumId}/unshares`,
				method: "PUT",
				body: { profiles: [{ profileId: 7, shareId: "share-1" }] },
			}).status,
		).toBe(200);
		expect(sharesOf(albumId)).not.toContain(7);
	});

	it("rejects an album unshare whose body is not the documented shape", () => {
		expect(() =>
			demoRoute({
				path: "/v1/albums/900/unshares",
				method: "PUT",
				body: { profileIds: [1] },
			}),
		).toThrow();
	});

	it("rejects an album share whose body is not the documented shape", () => {
		expect(() =>
			demoRoute({
				path: "/v4/albums/900/shares",
				method: "POST",
				body: { profileIds: [1] },
			}),
		).toThrow();
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

	it("sending media echoes it back under the type it was sent as", () => {
		const send = (type: string, body: unknown) =>
			apiResponseMessageSchema.parse(
				route("/v4/chat/message/send", "POST", {
					type,
					target: { type: "Direct", targetId: 100001 },
					body,
				}),
			);

		expect(send("Image", { mediaId: 800_001 }).type).toBe("Image");
		expect(
			send("ExpiringImage", { mediaId: 800_001, expiring: true }).type,
		).toBe("ExpiringImage");
	});

	it("taps and views validate", () => {
		const taps = route("/v2/taps/received") as { profiles: unknown[] };
		for (const tap of taps.profiles) tapProfileSchema.parse(tap);

		const views = route("/v7/views/list") as {
			profiles: unknown[];
			previews: unknown[];
		};
		for (const profile of views.profiles)
			viewerProfileSchema.parse(profile);
		for (const preview of views.previews) viewPreviewSchema.parse(preview);
	});

	it("reference data validates and mutations are accepted no-ops", () => {
		gendersSchema.parse(route("/public/v2/genders"));
		pronounsSchema.parse(route("/v1/pronouns"));
		profileTagsResponseSchema.parse(route("/v1/tags"));
		expect(
			demoRoute({
				path: "/v4/me/profile",
				method: "PATCH",
				body: { aboutMe: "x" },
			}).status,
		).toBe(200);
		expect(
			demoRoute({
				path: "/v3/me/blocks/100001",
				method: "POST",
				body: undefined,
			}).status,
		).toBe(200);
		expect(
			demoRoute({
				path: "/v3/me/favorites/100001",
				method: "POST",
				body: undefined,
			}).status,
		).toBe(200);
	});

	it("conversation pin/mute/delete mutations persist across inbox fetches", () => {
		const inbox = () => {
			const body = route("/v4/inbox?page=1", "POST") as {
				entries: unknown[];
			};
			return z.array(fullConversationSchema).parse(body.entries);
		};
		const [first, second, third] = inbox();
		if (!first || !second || !third)
			throw new Error(
				"the demo inbox has fewer than three conversations",
			);

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
			after.some(
				(e) => e.data.conversationId === third.data.conversationId,
			),
		).toBe(false);
	});

	it("favorite mutations persist across inbox and profile fetches", () => {
		const inbox = () => {
			const body = route("/v4/inbox?page=1", "POST") as {
				entries: unknown[];
			};
			return z.array(fullConversationSchema).parse(body.entries);
		};
		const starred = inbox().find((entry) => entry.data.favorite);
		if (!starred)
			throw new Error("the demo inbox has no favorited conversation");
		const profileId = starred.data.participants[0]?.profileId;
		if (!profileId)
			throw new Error("the favorited conversation has no participant");

		route(`/v3/me/favorites/${profileId}`, "DELETE");

		const conversationAfter = inbox().find(
			(entry) =>
				entry.data.conversationId === starred.data.conversationId,
		);
		expect(conversationAfter?.data.favorite).toBe(false);
		const profileAfter = route(`/v7/profiles/${profileId}`, "GET") as {
			profiles: { isFavorite: boolean }[];
		};
		expect(profileAfter.profiles[0]?.isFavorite).toBe(false);

		route(`/v3/me/favorites/${profileId}`, "POST");
		expect(
			inbox().find(
				(entry) =>
					entry.data.conversationId === starred.data.conversationId,
			)?.data.favorite,
		).toBe(true);
	});

	it("keeps every conversation peer's profile favorite in agreement with its row", () => {
		const body = route("/v4/inbox?page=1", "POST") as {
			entries: unknown[];
		};
		const entries = z.array(fullConversationSchema).parse(body.entries);
		expect(entries.length).toBeGreaterThan(0);

		for (const entry of entries) {
			const profileId = entry.data.participants[0]?.profileId;
			const profile = (
				route(`/v7/profiles/${profileId}`, "GET") as {
					profiles: { isFavorite: boolean }[];
				}
			).profiles[0];
			expect(
				profile?.isFavorite,
				`profile ${profileId} vs its conversation row`,
			).toBe(entry.data.favorite);
		}
	});

	it("filters the inbox server-side when the body asks for favorites only", () => {
		const body = route("/v4/inbox?page=1", "POST", {
			favoritesOnly: true,
		}) as { entries: unknown[] };
		const entries = z.array(fullConversationSchema).parse(body.entries);

		expect(entries.length).toBeGreaterThan(0);
		expect(entries.every((entry) => entry.data.favorite)).toBe(true);
	});
});
