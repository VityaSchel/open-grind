import { createContext } from "svelte";

import { accountScoped } from "$lib/api/account-caches";
import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

export const getOrCreateConversationsState = accountScoped(
	(profileId) => new ConversationsState(profileId),
);
