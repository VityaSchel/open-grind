const CONVERSATION = "grindr://conversation";
const TAPS = "grindr://taps-inbox";

export function routeForDeeplink(deeplink: string): string | null {
	const [path = "", ...queryParts] = deeplink.split("?");
	const query = queryParts.join("?");
	const target = path.toLowerCase().replace(/\/+$/, "");
	if (target === TAPS) return "/interest/taps";
	if (target !== CONVERSATION) return null;

	const conversationId = new URLSearchParams(query).get("id");
	return conversationId
		? `/chat/${encodeURIComponent(conversationId)}`
		: null;
}
