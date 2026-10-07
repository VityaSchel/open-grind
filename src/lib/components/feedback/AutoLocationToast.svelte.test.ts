// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import AutoLocationToast from "./AutoLocationToast.svelte";

function textAroundIcon(container: HTMLElement): string[] {
	const icons = container.querySelectorAll("svg");
	expect(icons).toHaveLength(1);
	const [icon] = icons;
	const nodes = [...(icon?.parentNode?.childNodes ?? [])];
	const at = nodes.findIndex((node) => node === icon);
	const text = (part: ChildNode[]) =>
		part.map((node) => node.textContent).join("");
	return [text(nodes.slice(0, at)), text(nodes.slice(at + 1))];
}

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

describe("AutoLocationToast", () => {
	it("points to the menu icon that turns GPS tracking off", () => {
		const { container } = render(AutoLocationToast);

		expect(textAroundIcon(container)).toStrictEqual([
			"Your location will be updating automatically using GPS. Turn this off in the ",
			" menu.",
		]);
	});

	it("keeps the icon inside the sentence in the active locale", async () => {
		const { container } = render(AutoLocationToast);

		await setLocale({ locale: "en-XA" });

		expect(container.textContent).toMatch(PSEUDO_MESSAGE);
		const [before = "", after = ""] = textAroundIcon(container);
		expect(before.startsWith("⟦")).toBe(true);
		expect(after.endsWith("⟧")).toBe(true);
		expect(after.trim()).not.toBe("⟧");
	});
});
