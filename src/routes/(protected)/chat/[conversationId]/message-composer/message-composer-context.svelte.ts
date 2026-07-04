import { createContext } from "svelte";

export const [getMessageComposerContext, setMessageComposerContext] =
	createContext<
		() => {
			disabled: boolean;
		}
	>();
