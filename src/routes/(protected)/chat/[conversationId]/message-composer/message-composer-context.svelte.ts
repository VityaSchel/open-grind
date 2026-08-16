import { createContext } from "svelte";

import type { MessageDraft } from "$lib/model/messaging/messages";

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<
		() => {
			disabled: boolean;
			sendMessages: (drafts: MessageDraft[]) => void | Promise<void>;
		}
	>();
