import { albumShareRequestSchema } from "$lib/model/messaging/albums";
import { demoMeProfileId } from "./config";
import { demoAlbumContent, demoMyAlbums, demoShareAlbum } from "./mock/albums";
import {
	demoConversationMessages,
	demoConversations,
	demoDeleteConversation,
	demoDrawerMedia,
	demoSentMessage,
	demoSetConversationMuted,
	demoSetConversationPinned,
	demoSingleMessage,
} from "./mock/conversations";
import { demoSetFavorite } from "./mock/favorites";
import {
	buildFullProfile,
	demoCascadeV4,
	demoGetProfiles,
	demoMyUploadedPhotos,
	demoSearchProfiles,
	num,
} from "./mock/grid";
import { demoReceivedTaps, demoViews } from "./mock/interest";
import { profileSeed } from "./mock/profiles";
import { demoGenders, demoPronouns, demoTags } from "./mock/reference";

type DemoResponse = { status: number; body: unknown };

function ok(body: unknown): DemoResponse {
	return { status: 200, body };
}

export function demoCallMethod(method: string): unknown {
	switch (method) {
		case "auth_state":
			return demoMeProfileId;
		case "login":
		case "login_with_google":
		case "google_sign_in":
		case "refresh_token":
			return { profileId: demoMeProfileId, restriction: null };
		case "rotate_api_params":
			return { "user-agent": "demo", "l-device-info": "demo" };
		case "recaptcha_first_party_enabled":
			return false;
		case "session_health":
			return { signedIn: true, expiresAt: null, stale: false };
		default:
			return null;
	}
}

export function demoRoute({
	path,
	method,
	body,
}: {
	path: string;
	method: string;
	body: unknown;
}): DemoResponse {
	const [rawPath = "", queryString = ""] = path.split("?");
	const params = new URLSearchParams(queryString);
	const segments = rawPath.split("/").filter(Boolean);
	const conversationId = segments[3] ?? "";
	const messageId = segments[5] ?? "";

	if (method === "GET" && rawPath === "/v4/cascade") {
		return ok(demoCascadeV4(params));
	}
	if (method === "GET" && rawPath === "/v7/search") {
		return ok({ profiles: demoSearchProfiles(params) });
	}
	if (method === "GET" && rawPath.startsWith("/v7/profiles/")) {
		const id = Number(segments.at(-1));
		return ok({ profiles: [buildFullProfile(profileSeed(id))] });
	}
	if (method === "POST" && rawPath === "/v3/profiles") {
		const ids =
			(body as { targetProfileIds?: number[] })?.targetProfileIds ?? [];
		return ok({ profiles: demoGetProfiles(ids) });
	}
	if (rawPath === "/v3.1/me/profile/images" && method === "GET") {
		return ok(demoMyUploadedPhotos());
	}
	if (rawPath === "/public/v2/genders") return ok(demoGenders);
	if (rawPath === "/v1/pronouns") return ok(demoPronouns);
	if (rawPath === "/v1/tags") return ok(demoTags);
	if (rawPath === "/v2/taps/received")
		return ok({ profiles: demoReceivedTaps() });
	if (rawPath === "/v2/taps/add") return ok({ isMutual: false });
	if (rawPath === "/v7/views/list") return ok(demoViews());
	if (rawPath === "/v3.1/me/blocks") return ok({ blocking: [] });
	if (
		segments.length === 4 &&
		segments[0] === "v3" &&
		segments[1] === "me" &&
		segments[2] === "favorites" &&
		(method === "POST" || method === "DELETE")
	) {
		demoSetFavorite({
			profileId: Number(segments[3]),
			favorite: method === "POST",
		});
		return ok({});
	}
	if (method === "POST" && rawPath === "/v4/inbox") {
		const filters = body as { favoritesOnly?: boolean } | undefined;
		return ok(
			demoConversations({
				page: num(params.get("page")) ?? 1,
				favoritesOnly: filters?.favoritesOnly ?? false,
			}),
		);
	}
	if (
		method === "GET" &&
		rawPath.startsWith("/v5/chat/conversation/") &&
		rawPath.endsWith("/message")
	) {
		return ok(
			demoConversationMessages({
				conversationId,
				pageKey: params.get("pageKey") ?? undefined,
			}),
		);
	}
	if (
		method === "GET" &&
		segments[0] === "v4" &&
		segments[2] === "conversation" &&
		segments[4] === "message" &&
		segments.length === 6
	) {
		return ok(demoSingleMessage({ conversationId, messageId }));
	}
	if (method === "GET" && rawPath === "/v1/albums") {
		return ok(demoMyAlbums());
	}
	if (
		method === "POST" &&
		segments[0] === "v4" &&
		segments[1] === "albums" &&
		segments[3] === "shares" &&
		segments.length === 4
	) {
		const { profiles } = albumShareRequestSchema.parse(body);
		demoShareAlbum({
			albumId: Number(segments[2]),
			profileIds: profiles.map((profile) => profile.profileId),
		});
		return ok({});
	}
	if (method === "GET" && segments[0] === "v2" && segments[1] === "albums") {
		return ok(demoAlbumContent(Number(segments[2])));
	}
	if (method === "POST" && rawPath === "/v4/chat/message/send") {
		return ok(demoSentMessage(body));
	}
	if (
		method === "POST" &&
		segments[0] === "v4" &&
		segments[1] === "chat" &&
		segments[2] === "conversation" &&
		segments.length === 5 &&
		(segments[4] === "pin" || segments[4] === "unpin")
	) {
		demoSetConversationPinned({
			conversationId,
			pinned: segments[4] === "pin",
		});
		return ok({});
	}
	if (
		method === "POST" &&
		segments[0] === "v1" &&
		segments[1] === "push" &&
		segments[2] === "conversation" &&
		segments.length === 5 &&
		(segments[4] === "mute" || segments[4] === "unmute")
	) {
		demoSetConversationMuted({
			conversationId,
			muted: segments[4] === "mute",
		});
		return ok({});
	}
	if (
		method === "DELETE" &&
		segments[0] === "v4" &&
		segments[1] === "chat" &&
		segments[2] === "conversation" &&
		segments.length === 4
	) {
		demoDeleteConversation(conversationId);
		return ok({});
	}
	if (method === "GET" && rawPath.startsWith("/v4/chat/media/drawer/")) {
		return ok(demoDrawerMedia());
	}
	if (method === "GET" && rawPath === "/v3/places/search") {
		return ok({ places: [] });
	}

	return ok({});
}
