import { createContext } from "svelte";

import { accountScoped } from "$lib/api/account-caches";
import { showIncomingMessageToast } from "$lib/components/incoming-message-toast/incoming-message-toast-manager";
import { ConversationsState } from "./conversations-state.svelte";

export const [getConversations, setConversations] =
	createContext<ConversationsState>();

export const getOrCreateConversationsState = accountScoped(
	(profileId) =>
		new ConversationsState({
			ourProfileId: profileId,
			onIncomingMessage: ({ message, conversation }) =>
				showIncomingMessageToast({
					message,
					sender: {
						name: conversation.data.name,
						avatarMediaHash:
							conversation.data.participants[0]
								?.primaryMediaHash ?? null,
					},
					conversationId: conversation.data.conversationId,
				}),
		}),
);
