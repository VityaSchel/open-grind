// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale, SOURCE_LOCALE } from "$lib/i18n";
import { PSEUDO_MESSAGE } from "$lib/i18n/fixtures/pseudo-message";
import ViewedPreview from "./ViewedPreview.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function renderPreview({
	totalCount = 5,
	maxDisplayCount = 99,
	isSecretAdmirer = false,
}: {
	totalCount?: number;
	maxDisplayCount?: number;
	isSecretAdmirer?: boolean;
} = {}) {
	return render(ViewedPreview, {
		props: {
			preview: {
				profileImageMediaHash: null,
				distance: null,
				isFavorite: false,
				lastViewed: null,
				isSecretAdmirer,
				viewedCount: { totalCount, maxDisplayCount },
				rightNowStatus: "NONE",
			},
		},
	});
}

function counterOf(container: HTMLElement): HTMLElement {
	const counter = container.querySelector<HTMLElement>("[title]");
	if (counter === null) throw new Error("No view counter");
	return counter;
}

function screenReaderTexts(container: HTMLElement): string[] {
	return [...container.querySelectorAll(".sr-only")].map(
		(element) => element.textContent,
	);
}

describe("ViewedPreview", () => {
	it("counts every view when the total fits", () => {
		const counter = counterOf(renderPreview({ totalCount: 5 }).container);

		expect(counter.textContent).toBe(" 5views");
		expect(counter.title).toBe("5 views");
	});

	it("caps the shown count and keeps the total in the title", () => {
		const counter = counterOf(
			renderPreview({ totalCount: 150, maxDisplayCount: 99 }).container,
		);

		expect(counter.textContent).toBe(" 99+views");
		expect(counter.title).toBe("150 views");
	});

	it.each([
		{ isSecretAdmirer: true, viewer: "Secret admirer" },
		{ isSecretAdmirer: false, viewer: "Hidden viewer" },
	])(
		"names the viewer $viewer when isSecretAdmirer is $isSecretAdmirer",
		({ isSecretAdmirer, viewer }) => {
			const { container } = renderPreview({ isSecretAdmirer });

			expect(screenReaderTexts(container)).toEqual([viewer, "views"]);
		},
	);

	it.each([{ isSecretAdmirer: true }, { isSecretAdmirer: false }])(
		"words the viewer and the view count in the active locale when isSecretAdmirer is $isSecretAdmirer",
		async ({ isSecretAdmirer }) => {
			const { container } = renderPreview({ isSecretAdmirer });

			await setLocale({ locale: "en-XA" });

			const counter = counterOf(container);
			const [viewer, views] = screenReaderTexts(container);
			expect(viewer).toMatch(PSEUDO_MESSAGE);
			expect(counter.title).toMatch(PSEUDO_MESSAGE);
			expect(counter.textContent.trim()).toMatch(PSEUDO_MESSAGE);
			expect(views).not.toBe("views");
			expect(counter.textContent).toContain(`5${views}`);
		},
	);
});
