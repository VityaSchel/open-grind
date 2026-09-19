const CONVERSATION = "grindr://conversation";
const TAPS = "grindr://taps-inbox";

export function routeForDeeplink(deeplink: string): string | null {
	const [target = "", query = ""] = deeplink.split("?", 2);
	if (target.toLowerCase() === TAPS) return "/interest/taps";
	if (target.toLowerCase() !== CONVERSATION) return null;

	const conversationId = new URLSearchParams(query).get("id");
	return conversationId
		? `/chat/${encodeURIComponent(conversationId)}`
		: null;
}
