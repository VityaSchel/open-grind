import { expect, type Page, test } from "@playwright/test";

import { DEMO_CONVERSATION, installTauriShim } from "./support/app";

const DRAFT = "meet at 8?";
const DESCRIPTION = '[data-slot="item-description"]';
const CONVERSATION_LINK = 'a[href^="/chat/"]';

function composer(page: Page) {
	return page.getByRole("textbox");
}

function rowLink(page: Page, href: string) {
	return page.locator(`a[href="${href}"]`).first();
}

function rowPreview(page: Page, href: string) {
	return page.locator(`a[href="${href}"] ${DESCRIPTION}`).first();
}

async function openConversations(page: Page): Promise<string[]> {
	await installTauriShim(page);
	await page.goto("/chat");
	await page.locator(CONVERSATION_LINK).first().waitFor({ timeout: 60_000 });
	const hrefs = await page
		.locator(CONVERSATION_LINK)
		.evaluateAll((links) =>
			links.map((link) => link.getAttribute("href") ?? ""),
		);
	return [...new Set(hrefs)];
}

test("a draft outlives leaving its conversation and never follows another one", async ({
	page,
}) => {
	test.setTimeout(180_000);
	const [first, second] = await openConversations(page);
	expect(first, "demo inbox has two conversations").toBeDefined();
	expect(second, "demo inbox has two conversations").toBeDefined();

	await rowLink(page, first!).click();
	await composer(page).waitFor({ timeout: 60_000 });
	await composer(page).fill(DRAFT);
	await page.getByRole("link", { name: "Back to chats" }).click();

	const preview = rowPreview(page, first!);
	await expect(preview).toBeVisible();
	await expect
		.poll(() => preview.evaluate((element) => element.textContent))
		.toBe(`Draft:\u00a0${DRAFT}`);

	const prefix = preview.locator('[data-slot="conversation-draft-prefix"]');
	const prefixStyle = await prefix.evaluate((element) => {
		const style = getComputedStyle(element);
		return { display: style.display, weight: style.fontWeight };
	});
	expect(
		prefixStyle.display,
		"an inline prefix shares the clamped line",
	).toBe("inline");
	expect(Number(prefixStyle.weight)).toBeGreaterThanOrEqual(700);
	await expect
		.poll(() =>
			prefix.evaluate(
				(element) =>
					getComputedStyle(element).color ===
					getComputedStyle(element.parentElement!).color,
			),
		)
		.toBe(false);

	await rowLink(page, second!).click();
	await composer(page).waitFor({ timeout: 60_000 });
	await expect(composer(page)).toHaveValue("");

	await page.getByRole("link", { name: "Back to chats" }).click();
	await rowLink(page, first!).click();
	await expect(composer(page)).toHaveValue(DRAFT);
});

test.describe("split layout", () => {
	test.use({ viewport: { width: 900, height: 800 } });

	test("typing reaches the conversations list without leaving the conversation", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		await installTauriShim(page);
		await page.goto(DEMO_CONVERSATION);
		await composer(page).waitFor({ timeout: 60_000 });

		await composer(page).fill(DRAFT);

		await expect(rowPreview(page, DEMO_CONVERSATION)).toHaveText(
			`Draft: ${DRAFT}`,
		);
	});
});

test("the draft label stays on the first line of the preview", async ({
	page,
}) => {
	test.setTimeout(180_000);
	await installTauriShim(page);
	await page.goto(DEMO_CONVERSATION);
	await composer(page).waitFor({ timeout: 60_000 });
	await composer(page).fill("supercalifragilisticexpialidocious tonight");
	await page.getByRole("link", { name: "Back to chats" }).click();

	const preview = rowPreview(page, DEMO_CONVERSATION);
	await preview.waitFor({ timeout: 30_000 });

	const lines = await preview.evaluate((element) => {
		const prefix = element.querySelector<HTMLElement>(
			'[data-slot="conversation-draft-prefix"]',
		)!;
		const text = [...element.childNodes].find(
			(node) =>
				node.nodeType === Node.TEXT_NODE && node.textContent!.trim(),
		)!;
		const range = document.createRange();
		range.selectNodeContents(text);
		return {
			prefixTop: Math.round(prefix.getBoundingClientRect().top),
			textTop: Math.round([...range.getClientRects()][0]!.top),
			clipped: element.scrollWidth > element.clientWidth,
		};
	});

	expect(lines.textTop, "the draft starts on the label's line").toBe(
		lines.prefixTop,
	);
	expect(lines.clipped, "a long first word breaks instead of clipping").toBe(
		false,
	);
});
