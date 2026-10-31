import type { Attachment } from "svelte/attachments";

const SINGLE_CLICK_DELAY_MS = 300;

export const singleClick: Attachment<HTMLElement> = (element) => {
	let pending: ReturnType<typeof setTimeout> | undefined;
	const cancel = () => {
		clearTimeout(pending);
		pending = undefined;
	};
	const click = (event: MouseEvent) => {
		if (event.detail === 0) return;
		cancel();
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.detail === 1)
			pending = setTimeout(() => element.click(), SINGLE_CLICK_DELAY_MS);
	};
	element.addEventListener("click", click, true);
	element.addEventListener("pointerdown", cancel);
	element.addEventListener("dblclick", cancel);
	return () => {
		cancel();
		element.removeEventListener("click", click, true);
		element.removeEventListener("pointerdown", cancel);
		element.removeEventListener("dblclick", cancel);
	};
};
