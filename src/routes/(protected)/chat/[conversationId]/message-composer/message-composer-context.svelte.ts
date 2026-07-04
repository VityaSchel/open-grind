import { createContext } from "svelte";

import type { Message } from "$lib/model/message";

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<
		() => {
			disabled: boolean;
			sendMessage: (message: Message) => void | Promise<void>;
		}
	>();
