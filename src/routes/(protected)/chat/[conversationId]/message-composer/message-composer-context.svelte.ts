import { createContext } from "svelte";

import type { MessageDraft } from "#lib/model/messaging/messages.ts";

export type MessageComposerContext = () => {
	conversationId: string;
	disabled: boolean;
	sendMessages: (drafts: MessageDraft[]) => void | Promise<void>;
};

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<MessageComposerContext>();
