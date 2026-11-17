// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { PSEUDO_MESSAGE } from "#lib/i18n/fixtures/pseudo-message.ts";
import { setLocale, SOURCE_LOCALE } from "#lib/i18n/index.ts";
import ViewedPreview from "./ViewedPreview.svelte";

afterEach(async () => {
	cleanup();
	await setLocale({ locale: SOURCE_LOCALE });
});

function renderPreview({
	totalCount = 5,
	maxDisplayCount = 99,
	isSecretAdmirer = false,
	lastViewed = null,
}: {
	totalCount?: number;
	maxDisplayCount?: number;
	isSecretAdmirer?: boolean;
	lastViewed?: number | null;
} = {}) {
	return render(ViewedPreview, {
		props: {
			preview: {
				profileImageMediaHash: null,
				distance: null,
				isFavorite: false,
				lastViewed,
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

	it.each([
		{ isSecretAdmirer: true, totalCount: 1, label: "Secret admirer" },
		{
			isSecretAdmirer: false,
			totalCount: 5,
			label: "Hidden viewer, 5 views",
		},
	])(
		"is an image named $label for keyboard and screen reader users",
		({ isSecretAdmirer, totalCount, label }) => {
			renderPreview({ isSecretAdmirer, totalCount });

			expect(screen.getByRole("img", { name: label })).toBeTruthy();
		},
	);

	it.each([
		{ totalCount: 1, label: "Secret admirer, 5 mins" },
		{ totalCount: 3, label: "Secret admirer, 5 mins, 3 views" },
	])(
		"names the last view time it shows in the image name $label",
		({ totalCount, label }) => {
			renderPreview({
				isSecretAdmirer: true,
				totalCount,
				lastViewed: Date.now() - 5 * 60_000,
			});

			expect(screen.getByRole("img", { name: label })).toBeTruthy();
			expect(screen.getByText("5 mins")).toBeTruthy();
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
