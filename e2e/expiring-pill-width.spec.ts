import { expect, type Locator, type Page, test } from "@playwright/test";

import {
	emitMessageSent,
	EXPIRED_IMAGE,
	EXPIRING_IMAGE,
	EXPIRING_VIDEO,
	expiringImageMessage,
	expiringVideoMessage,
	FIRST_ROUTE_COMPILE_MS,
	installEventInjection,
	installTauriShim,
	MESSAGE_ROW,
} from "./support/app";

const ME = 123456000;
const THEM = 100006;
const CONVERSATION_ID = `${THEM}:${ME}`;
const SCROLLER = '[data-slot="messages-scroller"]';
const SPENT_IMAGE = '[data-slot="expiring-image-message-spent"]';
const LONGER_LABEL = "Selbstlöschendes Bild";
const SHORTER_LABEL = "Bild";
const OVERLONG_LABEL = Array.from({ length: 8 }, () => LONGER_LABEL).join(" ");
const WRAPPED_PANE_SHARE = 0.75;

type Pill = { name: string; selector: string; delivered?: () => unknown };

type PillGeometry = {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	leadingGutter: number;
	trailingGutter: number;
	iconWidth: number;
	labelWidth: number;
	labelTop: number;
	labelBottom: number;
	labelLines: number;
	paneLeft: number;
	paneRight: number;
};

function envelope(senderId: number) {
	const timestamp = Date.now() + 60_000;
	return {
		messageId: `ws-pill-${timestamp}`,
		conversationId: CONVERSATION_ID,
		senderId,
		timestamp,
		unsent: false,
		reactions: [],
		replyToMessage: null,
	};
}

const PILLS: Pill[] = [
	{
		name: "an expiring image we received",
		selector: EXPIRING_IMAGE,
		delivered: () => expiringImageMessage({ envelope: envelope(THEM) }),
	},
	{ name: "an expiring image we sent", selector: EXPIRING_IMAGE },
	{ name: "an expired image we received", selector: EXPIRED_IMAGE },
	{
		name: "an expiring image we sent that is gone",
		selector: SPENT_IMAGE,
		delivered: () =>
			expiringImageMessage({ envelope: envelope(ME), spent: true }),
	},
	{
		name: "an expiring video we received",
		selector: EXPIRING_VIDEO,
		delivered: () => expiringVideoMessage({ envelope: envelope(THEM) }),
	},
	{
		name: "an expiring video we sent",
		selector: EXPIRING_VIDEO,
		delivered: () => expiringVideoMessage({ envelope: envelope(ME) }),
	},
];

async function openPill(page: Page, pill: Pill): Promise<Locator> {
	await installTauriShim(page);
	await installEventInjection(page);
	await page.goto(`/chat/${CONVERSATION_ID}`);
	await page
		.locator(MESSAGE_ROW)
		.first()
		.waitFor({ timeout: FIRST_ROUTE_COMPILE_MS });
	if (pill.delivered) {
		await emitMessageSent(page, pill.delivered());
		await expect(
			page.locator(MESSAGE_ROW).last().locator(pill.selector),
			"the delivered pill should be the newest message",
		).toHaveCount(1);
	}
	const target = page.locator(pill.selector).last();
	await target.waitFor();
	await page.evaluate(() => document.fonts.ready);
	return target;
}

function measure(
	pill: Locator,
	{ relabel }: { relabel?: string } = {},
): Promise<PillGeometry> {
	return pill.evaluate(
		(element, { scroller, replacement }) => {
			const icon = element.querySelector("svg");
			if (!icon) throw new Error("the pill has no icon");
			const pane = document.querySelector(scroller);
			if (!pane) throw new Error("the messages scroller is missing");
			const texts = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
			);
			let label = texts.nextNode();
			while (label !== null && label.textContent?.trim() === "") {
				label = texts.nextNode();
			}
			if (!(label instanceof Text))
				throw new Error("the pill has no label");
			if (replacement !== undefined) label.data = replacement;
			const range = document.createRange();
			range.selectNodeContents(label);
			const lines = [...range.getClientRects()].filter(
				(line) => line.width > 0,
			);
			const labelLeft = Math.min(...lines.map((line) => line.left));
			const labelRight = Math.max(...lines.map((line) => line.right));
			const box = element.getBoundingClientRect();
			const iconBox = icon.getBoundingClientRect();
			const paneBox = pane.getBoundingClientRect();
			return {
				left: box.left,
				right: box.right,
				top: box.top,
				bottom: box.bottom,
				width: box.width,
				leadingGutter: iconBox.left - box.left,
				trailingGutter: box.right - labelRight,
				iconWidth: iconBox.width,
				labelWidth: labelRight - labelLeft,
				labelTop: Math.min(...lines.map((line) => line.top)),
				labelBottom: Math.max(...lines.map((line) => line.bottom)),
				labelLines: new Set(lines.map((line) => Math.round(line.top)))
					.size,
				paneLeft: paneBox.left,
				paneRight: paneBox.right,
			};
		},
		{ scroller: SCROLLER, replacement: relabel },
	);
}

for (const viewportWidth of [420, 320]) {
	test.describe(`in a ${viewportWidth}px wide window`, () => {
		test.use({ viewport: { width: viewportWidth, height: 800 } });

		for (const pill of PILLS) {
			test(`${pill.name} hugs its label and wraps it only when the conversation is narrower`, async ({
				page,
			}) => {
				const target = await openPill(page, pill);

				const english = await measure(target);
				expect(english.labelLines, "the label fits on one line").toBe(
					1,
				);
				expect(
					Math.abs(english.trailingGutter - english.leadingGutter),
					"the space after the label matches the space before the icon",
				).toBeLessThanOrEqual(1);
				expect(
					english.leadingGutter,
					"the icon keeps clear of the pill's edge",
				).toBeGreaterThanOrEqual(english.iconWidth / 2);

				const longer = await measure(target, { relabel: LONGER_LABEL });
				expect(
					longer.labelWidth,
					"the longer label is the wider one",
				).toBeGreaterThan(english.labelWidth + 10);
				expect(
					longer.labelLines,
					"a longer label still fits on one line",
				).toBe(1);
				expect(
					Math.abs(
						longer.width -
							english.width -
							(longer.labelWidth - english.labelWidth),
					),
					"the pill grows by exactly what the label grew",
				).toBeLessThanOrEqual(1);

				const shorter = await measure(target, {
					relabel: SHORTER_LABEL,
				});
				expect(
					Math.abs(
						english.width -
							shorter.width -
							(english.labelWidth - shorter.labelWidth),
					),
					"the pill shrinks by exactly what the label shrank",
				).toBeLessThanOrEqual(1);

				const overlong = await measure(target, {
					relabel: OVERLONG_LABEL,
				});
				expect(
					overlong.labelLines,
					"a label wider than the conversation wraps",
				).toBeGreaterThan(1);
				expect(
					overlong.labelTop,
					"the pill grows to hold every line of a wrapped label",
				).toBeGreaterThanOrEqual(overlong.top);
				expect(
					overlong.labelBottom,
					"the pill grows to hold every line of a wrapped label",
				).toBeLessThanOrEqual(overlong.bottom);
				expect(
					overlong.left,
					"the pill stays inside the conversation",
				).toBeGreaterThanOrEqual(overlong.paneLeft);
				expect(
					overlong.right,
					"the pill stays inside the conversation",
				).toBeLessThanOrEqual(overlong.paneRight);
				expect(
					overlong.width,
					"a wrapped pill uses the room the conversation has",
				).toBeGreaterThan(
					(overlong.paneRight - overlong.paneLeft) *
						WRAPPED_PANE_SHARE,
				);
				expect(
					Math.abs(overlong.iconWidth - english.iconWidth),
					"a wrapped label does not squash the icon",
				).toBeLessThanOrEqual(1);
			});
		}
	});
}
