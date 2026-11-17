export function keepOutOfSequentialFocus(element: HTMLElement): () => void {
	if (element.hasAttribute("tabindex")) return () => {};
	element.setAttribute("tabindex", "-1");
	return () => {
		element.removeAttribute("tabindex");
	};
}
