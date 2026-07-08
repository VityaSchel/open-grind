import { demoMeProfileId } from "./config";
import {
	demoAlbumContent,
	demoConversationMessages,
	demoConversations,
	demoDeleteConversation,
	demoDrawerMedia,
	demoSentMessage,
	demoSetConversationMuted,
	demoSetConversationPinned,
	demoSingleMessage,
} from "./mock/conversations";
import {
	buildFullProfile,
	buildShortProfile,
	demoCascadeV3,
	demoGetProfiles,
	demoMyUploadedPhotos,
	demoSearchProfiles,
	num,
} from "./mock/grid";
import { demoReceivedTaps, demoViews } from "./mock/interest";
import { meSeed, profileSeed } from "./mock/profiles";
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
		case "google_sign_in":
		case "refresh_token":
			return { profileId: demoMeProfileId };
		case "rotate_api_params":
			return { "user-agent": "demo", "l-device-info": "demo" };
		case "recaptcha_first_party_enabled":
			return false;
		default:
			return undefined;
	}
}

export function demoRoute(
	path: string,
	method: string,
	body: unknown,
): DemoResponse {
	const [rawPath, queryString = ""] = path.split("?");
	const params = new URLSearchParams(queryString);
	const segments = rawPath.split("/").filter(Boolean);

	if (method === "GET" && rawPath === "/v3/cascade") {
		return ok(demoCascadeV3(params));
	}
	if (method === "GET" && rawPath === "/v4/cascade") {
		return ok({
			items: [],
			nextPage: null,
			shuffled: false,
			hiddenProfiles: null,
			hiddenProfileInfo: null,
		});
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
	if (method === "GET" && rawPath === "/v4/me/profile") {
		return ok({ profiles: [buildShortProfile(meSeed)] });
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
	if (method === "POST" && rawPath === "/v4/inbox") {
		return ok(demoConversations(num(params.get("page")) ?? 1));
	}
	if (
		method === "GET" &&
		rawPath.startsWith("/v5/chat/conversation/") &&
		rawPath.endsWith("/message")
	) {
		const conversationId = segments[3];
		return ok(
			demoConversationMessages(
				conversationId,
				params.get("pageKey") ?? undefined,
			),
		);
	}
	if (
		method === "GET" &&
		segments[0] === "v4" &&
		segments[2] === "conversation" &&
		segments[4] === "message" &&
		segments.length === 6
	) {
		return ok(demoSingleMessage(segments[3], segments[5]));
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
		demoSetConversationPinned(segments[3], segments[4] === "pin");
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
		demoSetConversationMuted(segments[3], segments[4] === "mute");
		return ok({});
	}
	if (
		method === "DELETE" &&
		segments[0] === "v4" &&
		segments[1] === "chat" &&
		segments[2] === "conversation" &&
		segments.length === 4
	) {
		demoDeleteConversation(segments[3]);
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
