import type { Locator } from "@playwright/test";

export const BRAND_TITLE = "Open Grind";

export function readPseudoText(
	roots: Locator,
	{ brandTitle = "" }: { brandTitle?: string } = {},
) {
	return roots.evaluateAll((elements, brand) => {
		const withoutPseudo = (text: string): string => {
			const stripped = text.replace(/⟦[^⟦⟧]*⟧/g, " ");
			return stripped === text ? text : withoutPseudo(stripped);
		};
		const outsidePseudo = (text: string) =>
			withoutPseudo(text).match(/\p{Script=Latin}+/gu) ?? [];
		const translationOff = (element: Element) =>
			element.closest("[translate]")?.getAttribute("translate") === "no";
		const translatable = (element: Element) =>
			!translationOff(element) &&
			element.checkVisibility({ visibilityProperty: true });
		const texts = elements.map((root) => {
			const walker = document.createTreeWalker(
				root,
				NodeFilter.SHOW_TEXT,
			);
			let text = "";
			while (walker.nextNode()) {
				const { parentElement, nodeValue } = walker.currentNode;
				if (parentElement && translatable(parentElement)) {
					text += nodeValue;
				}
			}
			return text;
		});
		const attributes = elements
			.flatMap((root) => [root, ...root.querySelectorAll("*")])
			.filter(translatable)
			.flatMap((element) =>
				[
					"aria-label",
					"aria-roledescription",
					"title",
					"placeholder",
					"alt",
				].map((name) => element.getAttribute(name) ?? ""),
			);
		const title = document.title === brand ? "" : document.title;
		const pseudoCount = (values: string[]) =>
			values.join("").match(/⟦/g)?.length ?? 0;
		return {
			messages: pseudoCount(texts),
			labels: pseudoCount(attributes),
			leaks: [...texts, title, ...attributes].flatMap(outsidePseudo),
		};
	}, brandTitle);
}
