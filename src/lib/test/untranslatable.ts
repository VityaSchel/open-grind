export function untranslatableTexts(root: Element): string[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	const texts: string[] = [];
	while (walker.nextNode()) {
		const { parentElement, nodeValue } = walker.currentNode;
		const text = nodeValue?.trim() ?? "";
		const mode = parentElement
			?.closest("[translate]")
			?.getAttribute("translate");
		if (text !== "" && mode === "no") texts.push(text);
	}
	return texts;
}
