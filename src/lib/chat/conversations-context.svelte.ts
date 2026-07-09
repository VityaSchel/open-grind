import { createContext } from "svelte";

import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

let cachedState: ConversationsState | null = null;
let cachedProfileId: number | null = null;

export function getOrCreateConversationsState(
	profileId: number,
): ConversationsState {
	if (cachedState !== null && cachedProfileId === profileId) {
		return cachedState;
	}
	if (cachedState !== null) {
		void cachedState.destroy();
	}
	cachedState = new ConversationsState(profileId);
	cachedProfileId = profileId;
	return cachedState;
}
