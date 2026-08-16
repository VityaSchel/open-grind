import { createContext } from "svelte";
import type { Snippet } from "svelte";
import type { Attachment } from "svelte/attachments";

export const [getMessageContext, setMessageContext] =
	createContext<
		() => {
			firstInStack: boolean;
			lastInStack: boolean;
			indexInStack: number;
			isOut: boolean;
			timestamp: number;
		}
	>();

export type MessageRefs = {
	frame: HTMLElement | null;
	content: HTMLElement | null;
};

export const [getMessageMetaContext, setMessageMetaContext] =
	createContext<
		() => {
			clone: boolean;
			setRef: (el: HTMLElement | null) => void;
			adornments?: Snippet;
		}
	>();

export function messageRef(): Attachment<HTMLElement> {
	const meta = getMessageMetaContext();
	return (node) => {
		meta().setRef(node);
	};
}
