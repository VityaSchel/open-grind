import { createContext } from "svelte";

import type { Message } from "$lib/model/messaging/messages";

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<
		() => {
			disabled: boolean;
			sendMessage: (message: Message) => void | Promise<void>;
		}
	>();
