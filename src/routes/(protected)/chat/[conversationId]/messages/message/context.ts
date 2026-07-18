import { createContext } from "svelte";
import type { Snippet } from "svelte";

export const [getMessageContext, setMessageContext] = createContext<
	() => {
		firstInStack: boolean;
		lastInStack: boolean;
		indexInStack: number;
		isOut: boolean;
		timestamp: number;
	}
>();

export const [getMessageMetaContext, setMessageMetaContext] = createContext<
	() => {
		clone: boolean;
		setRef: (el: HTMLElement | null) => void;
		adornments?: Snippet;
	}
>();
