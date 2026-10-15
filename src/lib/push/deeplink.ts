const CONVERSATION = "grindr://conversation";
export const TAPS_DEEPLINK = "grindr://taps-inbox";

export function conversationDeeplink(conversationId: string): string {
	return `${CONVERSATION}?${new URLSearchParams({ id: conversationId })}`;
}

export function routeForDeeplink(deeplink: string): string | null {
	const [path = "", ...queryParts] = deeplink.split("?");
	const query = queryParts.join("?");
	const target = path.toLowerCase().replace(/\/+$/, "");
	if (target === TAPS_DEEPLINK) return "/interest/taps";
	if (target !== CONVERSATION) return null;

	const conversationId = new URLSearchParams(query).get("id");
	return conversationId
		? `/chat/${encodeURIComponent(conversationId)}`
		: null;
}
