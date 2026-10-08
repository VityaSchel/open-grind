export const slot = (name: string) =>
	document.querySelector<HTMLElement>(`[data-slot="${name}"]`)!;

export const markup = (root: Element) =>
	root.innerHTML.replaceAll("<!---->", "").trim();
